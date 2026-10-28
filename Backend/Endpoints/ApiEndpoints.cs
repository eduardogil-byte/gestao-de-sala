using System.Security.Claims;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using SalaGest.Api.Contracts;
using SalaGest.Api.Data;
using SalaGest.Api.Models;
using SalaGest.Api.Services;

namespace SalaGest.Api.Endpoints;

public static partial class ApiEndpoints
{
    public static void MapSalaGestEndpoints(this IEndpointRouteBuilder app)
    {
        MapAccounts(app);
        MapPasswords(app);
        MapCatalog(app);
        MapEnvironmentInventory(app);
        MapEnvironmentCompatibility(app);
        MapPedagogicalCatalog(app);
        MapCurricularWorkload(app);
        MapTeacherPedagogicalProfiles(app);
        MapAssignments(app);
        MapAcademicCalendar(app);
        MapSchedules(app);
        MapBookings(app);
        MapPedagogicalBookingOptions(app);
        MapLoans(app);
        MapOccupationManagement(app);
    }

    private static string UserId(ClaimsPrincipal user)
        => user.FindFirstValue(ClaimTypes.NameIdentifier) ?? "";

    private static IResult Error(string message) => Results.BadRequest(new ApiError(message));

    private static async Task<bool> SoftwareExists(AppDbContext db, IEnumerable<int> ids)
    {
        var unique = ids.Distinct().ToArray();
        return unique.Length == 0 || await db.SoftwareCatalog.CountAsync(s => unique.Contains(s.Id)) == unique.Length;
    }

    private static RoomNeed Need(TeachingAssignment a) => new(a.ClassGroup.Students,
        a.NeedsProjector, a.NeedsTeacherComputer, a.NeedsStudentComputers,
        a.MinTier, a.Software.Select(s => s.SoftwareId).ToArray(), a.MinRamGb, a.NeedsDedicatedGpu);

    private static RoomNeed Need(BookingRequest b) => new(b.Students,
        b.NeedsProjector, b.NeedsTeacherComputer, b.NeedsStudentComputers,
        b.MinTier, b.Software.Select(s => s.SoftwareId).ToArray(), b.MinRamGb, b.NeedsDedicatedGpu, b.StudentsPerComputer);

    private static object RoomView(Room r) => new
    {
        r.Id,
        r.Name,
        r.Location,
        r.Purpose,
        r.Kind,
        r.Seats,
        r.Desks,
        r.HasProjector,
        r.HasTeacherComputer,
        r.HasInternet,
        r.Active,
        ComputerGroups = r.ComputerGroups.Select(g => new
        {
            g.Id,
            g.Description,
            g.Quantity,
            g.RamGb,
            g.Tier,
            g.DedicatedGpu,
            Software = g.Software.Select(s => new { s.SoftwareId, Name = s.Software.Name, s.InstalledQuantity })
        })
    };

    private static async Task<List<Room>> AllRooms(AppDbContext db)
        => await db.Rooms.AsNoTracking().Include(r => r.ComputerGroups)
            .ThenInclude(g => g.Software).ThenInclude(s => s.Software).ToListAsync();

    private static void MapAccounts(IEndpointRouteBuilder app)
    {
        var api = app.MapGroup("/api/auth").WithTags("Autenticação");
        api.MapPost("/register", async (RegisterTeacher input, UserManager<AppUser> manager) =>
        {
            if (string.IsNullOrWhiteSpace(input.Name) || input.Name.Length > 120 ||
                string.IsNullOrWhiteSpace(input.Email)) return Error("Nome e e-mail são obrigatórios");
            var email = input.Email.Trim();
            var user = new AppUser { UserName = email, Email = email, DisplayName = input.Name.Trim() };
            var result = await manager.CreateAsync(user, input.Password);
            if (!result.Succeeded) return Error(string.Join("; ", result.Errors.Select(e => e.Description)));
            await manager.AddToRoleAsync(user, "Professor");
            return Results.Created("/api/me", new { user.Id, user.DisplayName, user.Email, Role = "Professor" });
        }).AllowAnonymous();

        api.MapPost("/login", async (LoginRequest input, SignInManager<AppUser> signIn) =>
        {
            signIn.AuthenticationScheme = IdentityConstants.BearerScheme;
            var result = await signIn.PasswordSignInAsync(input.Email, input.Password,
                isPersistent: false, lockoutOnFailure: true);
            if (result.IsLockedOut)
                return Results.Json(new ApiError("Muitas tentativas incorretas. Aguarde até 1 minuto e tente novamente."), statusCode: 429);
            return result.Succeeded ? Results.Empty : Results.Json(new ApiError("E-mail ou senha incorretos."), statusCode: 401);
        }).AllowAnonymous();

        app.MapGet("/api/me", async (ClaimsPrincipal current, UserManager<AppUser> manager) =>
        {
            var user = await manager.FindByIdAsync(UserId(current));
            return user is null ? Results.Unauthorized() : Results.Ok(new
            {
                user.Id,
                user.Email,
                user.DisplayName,
                Roles = await manager.GetRolesAsync(user)
            });
        }).RequireAuthorization().WithTags("Autenticação");
        app.MapGet("/api/teachers", async (UserManager<AppUser> manager) =>
        {
            var teachers = await manager.GetUsersInRoleAsync("Professor");
            return Results.Ok(teachers.Select(u => new { u.Id, u.DisplayName, u.Email }));
        }).RequireAuthorization().WithTags("Professores");
    }

    private static void MapCatalog(IEndpointRouteBuilder app)
    {
        var api = app.MapGroup("/api").RequireAuthorization().WithTags("Cadastros");
        api.MapGet("/shifts", async (AppDbContext db) =>
            Results.Ok(await db.Shifts.OrderBy(s => s.StartsAt).ToListAsync()));
        api.MapPost("/shifts", async (ShiftInput input, AppDbContext db) =>
        {
            if (string.IsNullOrWhiteSpace(input.Name) || input.Name.Length > 60 ||
                input.StartsAt >= input.EndsAt)
                return Error("Nome ou horários do turno inválidos");
            var item = new SchoolShift
            { Name = input.Name.Trim(), StartsAt = input.StartsAt, EndsAt = input.EndsAt };
            db.Shifts.Add(item); await db.SaveChangesAsync();
            return Results.Created($"/api/shifts/{item.Id}", item);
        }).RequireAuthorization("Admin");
        api.MapPut("/shifts/{id:int}", async (int id, ShiftInput input, AppDbContext db) =>
        {
            if (string.IsNullOrWhiteSpace(input.Name) || input.Name.Length > 60 ||
                input.StartsAt >= input.EndsAt)
                return Error("Nome ou horários do turno inválidos");
            var item = await db.Shifts.FindAsync(id);
            if (item is null) return Results.NotFound();
            if (await db.WeeklyClasses.AnyAsync(w => w.ShiftId == id &&
                w.Schedule.Status == ScheduleStatus.Publicada))
                return Results.Conflict(new ApiError("Não altere turnos utilizados por uma grade publicada"));
            item.Name = input.Name.Trim(); item.StartsAt = input.StartsAt; item.EndsAt = input.EndsAt;
            await db.SaveChangesAsync();
            return Results.NoContent();
        }).RequireAuthorization("Admin");
        api.MapGet("/software", async (AppDbContext db) =>
            Results.Ok(await db.SoftwareCatalog.OrderBy(s => s.Name).ToListAsync()));
        api.MapPost("/software", async (SoftwareCreate input, AppDbContext db) =>
        {
            var name = input.Name.Trim();
            if (name.Length is < 2 or > 100) return Error("Nome do software inválido");
            if (await db.SoftwareCatalog.AnyAsync(s => s.Name == name)) return Error("Software já cadastrado");
            var item = new Software { Name = name };
            db.SoftwareCatalog.Add(item);
            await db.SaveChangesAsync();
            return Results.Created($"/api/software/{item.Id}", item);
        }).RequireAuthorization("Admin");

        api.MapGet("/rooms", async (AppDbContext db) =>
            Results.Ok((await AllRooms(db)).Select(RoomView)));
        api.MapGet("/rooms/{id:int}", async (int id, AppDbContext db) =>
        {
            var room = (await AllRooms(db)).FirstOrDefault(r => r.Id == id);
            return room is null ? Results.NotFound() : Results.Ok(RoomView(room));
        });
        api.MapPost("/rooms", async (RoomInput input, AppDbContext db) =>
        {
            var validation = await ValidateRoom(db, input);
            if (validation is not null) return Error(validation);
            var room = CreateRoom(input);
            db.Rooms.Add(room);
            await db.SaveChangesAsync();
            return Results.Created($"/api/rooms/{room.Id}", new { room.Id, room.Name });
        }).RequireAuthorization("Admin");
        api.MapPut("/rooms/{id:int}", async (int id, RoomInput input, AppDbContext db) =>
        {
            var validation = await ValidateRoom(db, input);
            if (validation is not null) return Error(validation);
            var existing = await db.Rooms.Include(r => r.ComputerGroups)
                .ThenInclude(g => g.Software).FirstOrDefaultAsync(r => r.Id == id);
            if (existing is null) return Results.NotFound();
            existing.Name = input.Name.Trim(); existing.Location = input.Location.Trim();
            existing.Purpose = input.Purpose?.Trim() ?? "";
            existing.Kind = input.Kind; existing.Seats = input.Seats; existing.Desks = input.Desks;
            existing.HasProjector = input.HasProjector;
            existing.HasTeacherComputer = input.HasTeacherComputer;
            existing.HasInternet = input.HasInternet; existing.Active = input.Active;
            UpdateComputerGroups(existing.ComputerGroups, input.ComputerGroups);
            await db.SaveChangesAsync();
            return Results.NoContent();
        }).RequireAuthorization("Admin");

        api.MapGet("/semesters", async (AppDbContext db) =>
            Results.Ok(await db.Semesters.OrderByDescending(s => s.StartDate).ToListAsync()));
        api.MapPost("/semesters", async (SemesterCreate input, AppDbContext db) =>
        {
            if (string.IsNullOrWhiteSpace(input.Name) || input.StartDate > input.EndDate ||
                input.EndDate.DayNumber - input.StartDate.DayNumber > 370)
                return Error("Informe nome e datas válidas (até 370 dias)");
            var item = new Semester { Name = input.Name.Trim(), StartDate = input.StartDate, EndDate = input.EndDate };
            db.Semesters.Add(item); await db.SaveChangesAsync();
            return Results.Created($"/api/semesters/{item.Id}", item);
        }).RequireAuthorization("Admin");
        api.MapGet("/classes", async (int? semesterId, AppDbContext db) =>
            Results.Ok(await db.Classes.AsNoTracking()
                .Where(c => semesterId == null || c.SemesterId == semesterId).ToListAsync()));
        api.MapPost("/classes", async (ClassCreate input, AppDbContext db) =>
        {
            if (input.Students < 1 || input.Students > 500 || string.IsNullOrWhiteSpace(input.Name))
                return Error("Turma deve ter nome e quantidade de alunos válida");
            if (!await db.Semesters.AnyAsync(s => s.Id == input.SemesterId)) return Error("Semestre não encontrado");
            if (input.CourseId is int courseId && !await db.Courses.AnyAsync(c => c.Id == courseId))
                return Error("Curso não encontrado");
            var item = new ClassGroup
            {
                SemesterId = input.SemesterId,
                CourseId = input.CourseId,
                Name = input.Name.Trim(),
                Students = input.Students
            };
            db.Classes.Add(item); await db.SaveChangesAsync();
            return Results.Created($"/api/classes/{item.Id}", item);
        }).RequireAuthorization("Admin");
        api.MapPut("/classes/{id:int}/course", async (int id, ClassCourseInput input, AppDbContext db) =>
        {
            var classGroup = await db.Classes.FindAsync(id);
            if (classGroup is null) return Results.NotFound();
            if (!await db.Courses.AnyAsync(c => c.Id == input.CourseId)) return Error("Curso não encontrado");
            if (classGroup.CourseId == input.CourseId) return Results.NoContent();
            if (classGroup.CourseId is not null ||
                await db.Assignments.AnyAsync(a => a.ClassGroupId == id && a.CurricularUnitId != null))
                return Results.Conflict(new ApiError("O curso da turma já está definido ou possui atribuições pedagógicas"));
            classGroup.CourseId = input.CourseId;
            await db.SaveChangesAsync();
            return Results.NoContent();
        }).RequireAuthorization("Admin");

        api.MapGet("/teachers/{teacherId}/availability", async (string teacherId, AppDbContext db) =>
            Results.Ok(await db.Availabilities.Where(a => a.TeacherId == teacherId)
                .Select(a => new { a.Weekday, a.ShiftId }).ToListAsync()));
        api.MapPut("/teachers/{teacherId}/availability", async (string teacherId,
            List<AvailabilityInput> input, AppDbContext db, ClaimsPrincipal current) =>
        {
            if (UserId(current) != teacherId && !current.IsInRole("Admin")) return Results.Forbid();
            if (!await db.Users.AnyAsync(u => u.Id == teacherId)) return Results.NotFound();
            var shiftIds = input.Select(a => a.ShiftId).Distinct().ToArray();
            if (input.Any(a => a.Weekday < 1 || a.Weekday > 5) ||
                input.Select(a => (a.Weekday, a.ShiftId)).Distinct().Count() != input.Count ||
                (await db.Shifts.CountAsync(s => shiftIds.Contains(s.Id))) != shiftIds.Length)
                return Error("Dias/turnos inválidos ou repetidos. Dias: 1=segunda até 5=sexta");
            db.Availabilities.RemoveRange(await db.Availabilities
                .Where(a => a.TeacherId == teacherId).ToListAsync());
            db.Availabilities.AddRange(input.Select(a => new TeacherAvailability
            { TeacherId = teacherId, Weekday = a.Weekday, ShiftId = a.ShiftId }));
            await db.SaveChangesAsync();
            return Results.NoContent();
        });

    }

    private static async Task<string?> ValidateRoom(AppDbContext db, RoomInput input)
    {
        if (string.IsNullOrWhiteSpace(input.Name) || input.Name.Length > 120 ||
            !Enum.IsDefined(input.Kind) || input.Seats < 1 || input.Desks < 1 ||
            input.Seats > 1000 || input.Desks > 1000 ||
            input.ComputerGroups is null || (input.Purpose?.Length ?? 0) > 350) return "Informações da sala inválidas";
        foreach (var group in input.ComputerGroups)
        {
            if (group.Quantity < 1 || group.Quantity > 1000 || group.RamGb < 1 ||
                !Enum.IsDefined(group.Tier) || group.Software is null ||
                group.Software.Select(s => s.SoftwareId).Distinct().Count() != group.Software.Count ||
                group.Software.Any(s => s.InstalledQuantity < 1 || s.InstalledQuantity > group.Quantity))
                return "Configuração dos computadores inválida";
        }
        var softwareIds = input.ComputerGroups.SelectMany(g => g.Software).Select(s => s.SoftwareId);
        return await SoftwareExists(db, softwareIds) ? null : "Software não cadastrado";
    }

    private static Room CreateRoom(RoomInput input) => new()
    {
        Name = input.Name.Trim(),
        Location = input.Location.Trim(),
        Purpose = input.Purpose?.Trim() ?? "",
        Kind = input.Kind,
        Seats = input.Seats,
        Desks = input.Desks,
        HasProjector = input.HasProjector,
        HasTeacherComputer = input.HasTeacherComputer,
        HasInternet = input.HasInternet,
        Active = input.Active,
        ComputerGroups = NewComputerGroups(input.ComputerGroups)
    };

    private static List<ComputerGroup> NewComputerGroups(IEnumerable<ComputerGroupInput> groups)
        => groups.Select(g => new ComputerGroup
        {
            Description = g.Description,
            Quantity = g.Quantity,
            RamGb = g.RamGb,
            Tier = g.Tier,
            DedicatedGpu = g.DedicatedGpu,
            Software = g.Software.Select(s => new GroupSoftware
            { SoftwareId = s.SoftwareId, InstalledQuantity = s.InstalledQuantity }).ToList()
        }).ToList();

    private static void UpdateComputerGroups(List<ComputerGroup> existing,
        IEnumerable<ComputerGroupInput> inputs)
    {
        foreach (var input in inputs)
        {
            var group = existing.FirstOrDefault(g => string.Equals(g.Description.Trim(),
                input.Description.Trim(), StringComparison.OrdinalIgnoreCase));
            if (group is null)
            {
                existing.Add(NewComputerGroups(new[] { input })[0]);
                continue;
            }

            group.Description = input.Description.Trim();
            group.Quantity = input.Quantity;
            group.RamGb = input.RamGb;
            group.Tier = input.Tier;
            group.DedicatedGpu = input.DedicatedGpu;
            foreach (var software in input.Software)
            {
                var link = group.Software.FirstOrDefault(s => s.SoftwareId == software.SoftwareId);
                if (link is null)
                    group.Software.Add(new GroupSoftware
                    { SoftwareId = software.SoftwareId, InstalledQuantity = software.InstalledQuantity });
                else
                    link.InstalledQuantity = software.InstalledQuantity;
            }
        }
    }
}
