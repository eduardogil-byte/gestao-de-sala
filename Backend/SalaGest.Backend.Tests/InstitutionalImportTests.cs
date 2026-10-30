using System.Net;
using System.Net.Http.Json;
using System.Security.Claims;
using System.Text;
using System.Text.Encodings.Web;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using SalaGest.Api.Contracts;
using SalaGest.Api.Data;
using SalaGest.Api.Endpoints;
using SalaGest.Api.Models;
using Xunit;

namespace SalaGest.Backend.Tests;

public sealed class InstitutionalImportTests
{
    [Fact]
    public async Task PreviewDoesNotWriteAndConfirmationImportsOnlyValidRowsWithAudit()
    {
        await using var host = await ImportHost.CreateAsync();
        var existingId = await host.SeedRoomAsync();
        host.AsAdmin();
        var csv = "Codigo,IdAmbiente,Nome,Tipo,CapacidadeAlunos,Carteiras,Projetor,ComputadorDocente,Internet\n" +
            $"LAB1,{existingId},Oficina renovada,Oficina,25,20,Sim,Não,Sim\n" +
            "LAB2,,Laboratório novo,Laboratorio,30,30,Sim,Sim,Sim\n" +
            "LAB3,,Sala inválida,Comum,0,20,Sim,Sim,Sim\n";
        var previewResponse = await host.UploadAsync("preview", "Ambientes", csv);
        Assert.Equal(HttpStatusCode.OK, previewResponse.StatusCode);
        var preview = await previewResponse.Content.ReadFromJsonAsync<ImportPreview>();
        Assert.NotNull(preview);
        Assert.Equal(1, preview.NewCount);
        Assert.Equal(1, preview.UpdateCount);
        Assert.Equal(1, preview.InvalidCount);
        Assert.Equal(2, await host.CountRoomsAsync());
        Assert.Equal(HttpStatusCode.Conflict,
            (await host.UploadAsync("confirm", "Ambientes", csv, preview.Token)).StatusCode);
        var confirmation = await host.UploadAsync("confirm", "Ambientes", csv, preview.Token, true);
        Assert.Equal(HttpStatusCode.OK, confirmation.StatusCode);
        var report = await confirmation.Content.ReadFromJsonAsync<ImportReport>();
        Assert.NotNull(report);
        Assert.Equal(1, report.Created);
        Assert.Equal(1, report.Updated);
        Assert.Equal(1, report.Skipped);
        Assert.Equal(3, await host.CountRoomsAsync());
        using (var scope = host.App.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            Assert.Equal("LAB1", (await db.Rooms.FindAsync(existingId))!.Code);
            Assert.Equal(1, await db.AuditEntries.CountAsync(x => x.EntityType == "InstitutionalImport"));
            Assert.Equal(0, await db.Occupations.CountAsync());
        }
        Assert.Equal(HttpStatusCode.Conflict,
            (await host.UploadAsync("confirm", "Ambientes", csv, preview.Token, true)).StatusCode);
    }

    [Fact]
    public async Task StalePreviewAndPersistenceFailureLeaveNoPartialChanges()
    {
        await using var host = await ImportHost.CreateAsync();
        var existingId = await host.SeedRoomAsync();
        host.AsAdmin();
        var csv = "Codigo,IdAmbiente,Nome,Tipo,CapacidadeAlunos,Carteiras,Projetor,ComputadorDocente,Internet\n" +
            $"LAB1,{existingId},Mudança,Oficina,25,20,Sim,Não,Sim\n" +
            "LAB2,,Novo,Comum,30,30,Sim,Sim,Sim\n";
        var first = (await (await host.UploadAsync("preview", "Ambientes", csv))
            .Content.ReadFromJsonAsync<ImportPreview>())!;
        using (var scope = host.App.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            (await db.Rooms.FindAsync(existingId))!.Name = "Mudança concorrente";
            await db.SaveChangesAsync();
        }
        Assert.Equal(HttpStatusCode.Conflict,
            (await host.UploadAsync("confirm", "Ambientes", csv, first.Token)).StatusCode);
        var fresh = (await (await host.UploadAsync("preview", "Ambientes", csv))
            .Content.ReadFromJsonAsync<ImportPreview>())!;
        using (var scope = host.App.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            await db.Database.ExecuteSqlRawAsync("CREATE TRIGGER RejectRoom BEFORE INSERT ON Rooms BEGIN SELECT RAISE(ABORT, 'test'); END;");
        }
        Assert.Equal(HttpStatusCode.Conflict,
            (await host.UploadAsync("confirm", "Ambientes", csv, fresh.Token)).StatusCode);
        using (var scope = host.App.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            Assert.Equal("Mudança concorrente", (await db.Rooms.FindAsync(existingId))!.Name);
            Assert.Equal(2, await db.Rooms.CountAsync());
            Assert.Empty(await db.AuditEntries.ToListAsync());
        }
    }

    [Fact]
    public async Task ResourcesAndCapabilitiesRequireExistingRelationships()
    {
        await using var host = await ImportHost.CreateAsync();
        await host.SeedCatalogAndRoomAsync();
        host.AsAdmin();
        var resources = "CodigoAmbiente,Recurso,Categoria,Quantidade\nLAB1,Torno,Máquina,3\nINEXISTENTE,Projetor,Equipamento,1\nLAB1,Torno,Máquina,2\n";
        var resourcePreview = (await (await host.UploadAsync("preview", "Recursos", resources))
            .Content.ReadFromJsonAsync<ImportPreview>())!;
        Assert.Equal(1, resourcePreview.NewCount);
        Assert.Equal(1, resourcePreview.InvalidCount);
        Assert.Equal(1, resourcePreview.DuplicateCount);
        Assert.Equal(HttpStatusCode.OK,
            (await host.UploadAsync("confirm", "Recursos", resources, resourcePreview.Token, true)).StatusCode);
        var capabilities = "CodigoCurso,OrdemModulo,CodigoUC,Capacidade,Conteudos,CargaHoraria,Ordem\n" +
            "AUT,1,UC1,Programar CLP,Lógica,10,1\nAUT,1,INEXISTENTE,Medir,Metrologia,5,2\n";
        var capabilityPreview = (await (await host.UploadAsync("preview", "Capacidades", capabilities))
            .Content.ReadFromJsonAsync<ImportPreview>())!;
        Assert.Equal(1, capabilityPreview.NewCount);
        Assert.Equal(1, capabilityPreview.InvalidCount);
        Assert.Equal(HttpStatusCode.OK,
            (await host.UploadAsync("confirm", "Capacidades", capabilities, capabilityPreview.Token, true)).StatusCode);
        using var scope = host.App.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        Assert.Equal("LAB1", (await db.RoomResources.Include(x => x.Room).SingleAsync()).Room.Code);
        var capability = await db.CurricularCapabilities.Include(x => x.CurricularUnit).SingleAsync();
        Assert.Equal("UC1", capability.CurricularUnit.Code);
        db.CapabilityEnvironmentRequirements.Add(new CapabilityEnvironmentRequirement
        { CurricularCapabilityId = capability.Id, RoomKind = RoomKind.Laboratorio });
        await db.SaveChangesAsync();
        var changed = "CodigoCurso,OrdemModulo,CodigoUC,IdCapacidade,Capacidade,Conteudos,CargaHoraria,Ordem\n" +
            $"AUT,1,UC1,{capability.Id},Programar CLP,Lógica avançada,12,1\n";
        var changedPreview = (await (await host.UploadAsync("preview", "Capacidades", changed))
            .Content.ReadFromJsonAsync<ImportPreview>())!;
        Assert.Equal(1, changedPreview.UpdateCount);
        Assert.Equal(HttpStatusCode.OK,
            (await host.UploadAsync("confirm", "Capacidades", changed, changedPreview.Token)).StatusCode);
        using var checkScope = host.App.Services.CreateScope();
        var check = checkScope.ServiceProvider.GetRequiredService<AppDbContext>();
        Assert.Equal("Lógica avançada", (await check.CurricularCapabilities.FindAsync(capability.Id))!.Contents);
        Assert.NotNull(await check.CapabilityEnvironmentRequirements.FindAsync(capability.Id));
    }

    [Fact]
    public async Task TeacherCpfIsValidatedMaskedAndRestrictedToAdmin()
    {
        await using var host = await ImportHost.CreateAsync();
        var teacherId = await host.SeedTeacherAsync();
        var csv = "CPF,IdDocente,Nome,Email,Formacao\n" +
            $"529.982.247-25,{teacherId},Maria,docente@teste.local,Engenharia\n" +
            "111.111.111-11,,Inválido,invalido@teste.local,\n";
        host.AsTeacher();
        Assert.Equal(HttpStatusCode.Forbidden, (await host.UploadAsync("preview", "Docentes", csv)).StatusCode);
        host.AsAdmin();
        var preview = (await (await host.UploadAsync("preview", "Docentes", csv))
            .Content.ReadFromJsonAsync<ImportPreview>())!;
        Assert.Equal(1, preview.UpdateCount);
        Assert.Equal(1, preview.InvalidCount);
        Assert.DoesNotContain("52998224725", preview.Rows[0].Identifier);
        Assert.Equal(HttpStatusCode.OK,
            (await host.UploadAsync("confirm", "Docentes", csv, preview.Token, true)).StatusCode);
        using var scope = host.App.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        Assert.Equal("52998224725", (await db.Users.FindAsync(teacherId))!.Cpf);
        Assert.DoesNotContain("52998224725", string.Join(" ",
            (await db.AuditEntries.ToListAsync()).Select(x => x.AfterJson)));
    }

    [Fact]
    public async Task MissingOptionalValuesPreserveExistingResourceAndTeacherData()
    {
        await using var host = await ImportHost.CreateAsync();
        await host.SeedCatalogAndRoomAsync();
        var teacherId = await host.SeedTeacherAsync();
        host.AsAdmin();
        using (var scope = host.App.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var roomId = await db.Rooms.Where(x => x.Code == "LAB1").Select(x => x.Id).SingleAsync();
            db.RoomResources.Add(new RoomResource { RoomId = roomId, Name = "Torno", NormalizedName = "TORNO",
                Type = "Máquina", NormalizedType = "MÁQUINA", Quantity = 3,
                Description = "Manter esta descrição" });
            (await db.Users.FindAsync(teacherId))!.Education = "Formação anterior";
            await db.SaveChangesAsync();
        }
        var resources = "CodigoAmbiente,Recurso,Categoria,Quantidade\nLAB1,Torno,Máquina,5\n";
        var preview = (await (await host.UploadAsync("preview", "Recursos", resources))
            .Content.ReadFromJsonAsync<ImportPreview>())!;
        Assert.Equal(1, preview.UpdateCount);
        Assert.Equal(HttpStatusCode.OK,
            (await host.UploadAsync("confirm", "Recursos", resources, preview.Token)).StatusCode);
        var teachers = $"CPF,IdDocente,Nome,Habilidades\n52998224725,{teacherId},Maria,Eletricidade\n";
        var teacherPreview = (await (await host.UploadAsync("preview", "Docentes", teachers))
            .Content.ReadFromJsonAsync<ImportPreview>())!;
        Assert.Equal(HttpStatusCode.OK,
            (await host.UploadAsync("confirm", "Docentes", teachers, teacherPreview.Token)).StatusCode);
        using var checkScope = host.App.Services.CreateScope();
        var check = checkScope.ServiceProvider.GetRequiredService<AppDbContext>();
        Assert.Equal("Manter esta descrição", (await check.RoomResources.SingleAsync()).Description);
        Assert.Equal("Formação anterior", (await check.Users.FindAsync(teacherId))!.Education);
    }

    [Fact]
    public async Task BadHeaderAndUnregisteredTeacherAreReportedBeforeAnyWrite()
    {
        await using var host = await ImportHost.CreateAsync();
        host.AsAdmin();
        var badHeader = "Codigo,Nome,Tipo,CapacidadeAlunos,Carteiras,ColunaErrada\n" +
            "LAB1,Sala,Comum,20,20,valor\n";
        Assert.Equal(HttpStatusCode.BadRequest,
            (await host.UploadAsync("preview", "Ambientes", badHeader)).StatusCode);
        await host.SeedRoomAsync();
        var ambiguousRoom = "Codigo,Nome,Tipo,CapacidadeAlunos,Carteiras,Projetor,ComputadorDocente,Internet\n" +
            "NOVO,Oficina,Oficina,20,20,Sim,Sim,Sim\n";
        var roomPreview = (await (await host.UploadAsync("preview", "Ambientes", ambiguousRoom))
            .Content.ReadFromJsonAsync<ImportPreview>())!;
        Assert.Equal(1, roomPreview.InvalidCount);
        var newTeacher = "CPF,Nome,Email\n52998224725,Docente,novo@teste.local\n";
        var preview = (await (await host.UploadAsync("preview", "Docentes", newTeacher))
            .Content.ReadFromJsonAsync<ImportPreview>())!;
        Assert.Equal(1, preview.InvalidCount);
        Assert.Equal(0, preview.NewCount);
        using var scope = host.App.Services.CreateScope();
        Assert.Equal(0, await scope.ServiceProvider.GetRequiredService<AppDbContext>().Users.CountAsync());
    }

    private sealed class ImportHost : IAsyncDisposable
    {
        public WebApplication App { get; }
        private readonly SqliteConnection connection;
        private readonly HttpClient client;

        private ImportHost(WebApplication app, SqliteConnection connection)
        {
            App = app;
            this.connection = connection;
            client = app.GetTestClient();
        }

        public static async Task<ImportHost> CreateAsync()
        {
            var connection = new SqliteConnection("Data Source=:memory:");
            await connection.OpenAsync();
            var builder = WebApplication.CreateBuilder();
            builder.WebHost.UseTestServer();
            builder.Logging.ClearProviders();
            builder.Services.AddDbContext<AppDbContext>(options => options.UseSqlite(connection));
            builder.Services.AddIdentityCore<AppUser>().AddRoles<IdentityRole>()
                .AddEntityFrameworkStores<AppDbContext>().AddSignInManager();
            builder.Services.AddAuthentication("Test")
                .AddScheme<AuthenticationSchemeOptions, ImportAuthHandler>("Test", _ => { });
            builder.Services.AddAuthorization(options => options.AddPolicy("Admin", policy => policy.RequireRole("Admin")));
            var app = builder.Build();
            app.UseAuthentication();
            app.UseAuthorization();
            app.MapSalaGestEndpoints();
            await app.StartAsync();
            using var scope = app.Services.CreateScope();
            await scope.ServiceProvider.GetRequiredService<AppDbContext>().Database.EnsureCreatedAsync();
            return new ImportHost(app, connection);
        }

        public void AsAdmin() => SetRole("Admin");
        public void AsTeacher() => SetRole("Professor");
        private void SetRole(string role)
        {
            client.DefaultRequestHeaders.Remove("X-Test-Role");
            client.DefaultRequestHeaders.Add("X-Test-Role", role);
        }

        public async Task<HttpResponseMessage> UploadAsync(string action, string kind, string csv,
            string? token = null, bool allowInvalid = false)
        {
            using var form = new MultipartFormDataContent();
            form.Add(new StringContent(kind), "kind");
            form.Add(new ByteArrayContent(Encoding.UTF8.GetBytes(csv)), "file", "dados.csv");
            if (token is not null) form.Add(new StringContent(token), "token");
            if (allowInvalid) form.Add(new StringContent("true"), "allowInvalid");
            return await client.PostAsync($"/api/imports/{action}", form);
        }

        public async Task<int> SeedRoomAsync()
        {
            using var scope = App.Services.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var first = new Room { Name = "Oficina", Kind = RoomKind.Oficina, Seats = 20, Desks = 20 };
            db.Rooms.AddRange(first, new Room { Name = "Outra", Kind = RoomKind.Comum, Seats = 20, Desks = 20 });
            await db.SaveChangesAsync();
            return first.Id;
        }

        public async Task<int> CountRoomsAsync()
        {
            using var scope = App.Services.CreateScope();
            return await scope.ServiceProvider.GetRequiredService<AppDbContext>().Rooms.CountAsync();
        }

        public async Task SeedCatalogAndRoomAsync()
        {
            using var scope = App.Services.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            db.Rooms.Add(new Room { Code = "LAB1", NormalizedCode = "LAB1", Name = "Laboratório",
                Kind = RoomKind.Laboratorio, Seats = 30, Desks = 30 });
            db.Courses.Add(new Course { Code = "AUT", NormalizedCode = "AUT", Name = "Automação",
                NormalizedName = "AUTOMAÇÃO", Modules = [new CourseModule { Name = "Módulo 1",
                    NormalizedName = "MÓDULO 1", Order = 1, CurricularUnits = [new CurricularUnit
                    { Code = "UC1", NormalizedCode = "UC1", Name = "Programação",
                        NormalizedName = "PROGRAMAÇÃO" }] }] });
            await db.SaveChangesAsync();
        }

        public async Task<string> SeedTeacherAsync()
        {
            using var scope = App.Services.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var role = new IdentityRole("Professor") { NormalizedName = "PROFESSOR" };
            var teacher = new AppUser { UserName = "docente@teste.local", NormalizedUserName = "DOCENTE@TESTE.LOCAL",
                Email = "docente@teste.local", NormalizedEmail = "DOCENTE@TESTE.LOCAL", DisplayName = "Maria" };
            db.Roles.Add(role);
            db.Users.Add(teacher);
            await db.SaveChangesAsync();
            db.UserRoles.Add(new IdentityUserRole<string> { RoleId = role.Id, UserId = teacher.Id });
            await db.SaveChangesAsync();
            return teacher.Id;
        }

        public async ValueTask DisposeAsync()
        {
            client.Dispose();
            await App.DisposeAsync();
            await connection.DisposeAsync();
        }
    }

    private sealed class ImportAuthHandler(IOptionsMonitor<AuthenticationSchemeOptions> options,
        ILoggerFactory logger, UrlEncoder encoder) : AuthenticationHandler<AuthenticationSchemeOptions>(options, logger, encoder)
    {
        protected override Task<AuthenticateResult> HandleAuthenticateAsync()
        {
            if (!Request.Headers.TryGetValue("X-Test-Role", out var role))
                return Task.FromResult(AuthenticateResult.NoResult());
            var identity = new ClaimsIdentity([new Claim(ClaimTypes.NameIdentifier, "import-test"),
                new Claim(ClaimTypes.Role, role.ToString())], "Test");
            return Task.FromResult(AuthenticateResult.Success(new AuthenticationTicket(
                new ClaimsPrincipal(identity), "Test")));
        }
    }
}
