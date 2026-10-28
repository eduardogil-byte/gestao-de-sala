using Microsoft.EntityFrameworkCore;
using SalaGest.Api.Contracts;
using SalaGest.Api.Data;
using SalaGest.Api.Models;
using SalaGest.Api.Services;

namespace SalaGest.Api.Endpoints;

public static partial class ApiEndpoints
{
    private static void MapEnvironmentCompatibility(IEndpointRouteBuilder app)
    {
        var api = app.MapGroup("/api/courses/{courseId:int}/modules/{moduleId:int}/curricular-units/{unitId:int}/capabilities/{capabilityId:int}")
            .RequireAuthorization().WithTags("Compatibilidade de ambientes");

        api.MapGet("/environment-requirements", async (int courseId, int moduleId, int unitId,
            int capabilityId, AppDbContext db) =>
        {
            if (!await CapabilityExists(db, courseId, moduleId, unitId, capabilityId)) return Results.NotFound();
            var requirement = await RequirementQuery(db).FirstOrDefaultAsync(x => x.CurricularCapabilityId == capabilityId);
            return Results.Ok(RequirementView(requirement));
        });

        api.MapPost("/environment-requirements", async (int courseId, int moduleId, int unitId,
            int capabilityId, CapabilityEnvironmentInput input, AppDbContext db) =>
        {
            if (!await CapabilityExists(db, courseId, moduleId, unitId, capabilityId)) return Results.NotFound();
            var error = await ValidateRequirements(db, input);
            if (error is not null) return Error(error);
            if (await db.CapabilityEnvironmentRequirements.AnyAsync(x => x.CurricularCapabilityId == capabilityId))
                return Results.Conflict(new ApiError("Requisitos já cadastrados para esta capacidade"));
            var item = NewRequirement(capabilityId, input);
            db.CapabilityEnvironmentRequirements.Add(item);
            await db.SaveChangesAsync();
            return Results.Created($"/api/courses/{courseId}/modules/{moduleId}/curricular-units/{unitId}/capabilities/{capabilityId}/environment-requirements",
                RequirementView(item));
        }).RequireAuthorization("Admin");

        api.MapPut("/environment-requirements", async (int courseId, int moduleId, int unitId,
            int capabilityId, CapabilityEnvironmentInput input, AppDbContext db) =>
        {
            if (!await CapabilityExists(db, courseId, moduleId, unitId, capabilityId)) return Results.NotFound();
            var error = await ValidateRequirements(db, input);
            if (error is not null) return Error(error);
            var item = await RequirementQuery(db).FirstOrDefaultAsync(x => x.CurricularCapabilityId == capabilityId);
            if (item is null) return Results.NotFound();
            await using var transaction = await db.Database.BeginTransactionAsync();
            db.CapabilityResourceRequirements.RemoveRange(item.Resources);
            db.CapabilitySoftwareRequirements.RemoveRange(item.Software);
            await db.SaveChangesAsync();
            db.ChangeTracker.Clear();
            item = await db.CapabilityEnvironmentRequirements.SingleAsync(x => x.CurricularCapabilityId == capabilityId);
            item.RoomKind = input.RoomKind;
            item.RequiresProjector = input.RequiresProjector;
            item.RequiredComputers = input.RequiredComputers;
            item.MinRamGb = input.MinRamGb;
            item.ComputersCritical = input.ComputersCritical;
            var replacement = NewRequirement(capabilityId, input);
            db.CapabilityResourceRequirements.AddRange(replacement.Resources);
            db.CapabilitySoftwareRequirements.AddRange(replacement.Software);
            await db.SaveChangesAsync();
            await transaction.CommitAsync();
            return Results.NoContent();
        }).RequireAuthorization("Admin");

        api.MapGet("/compatibility/rooms/{roomId:int}", async (int courseId, int moduleId,
            int unitId, int capabilityId, int roomId, int? students, AppDbContext db) =>
        {
            if (!ValidStudents(students)) return Error("Quantidade de alunos inválida");
            if (!await CapabilityExists(db, courseId, moduleId, unitId, capabilityId)) return Results.NotFound();
            var room = await RoomQuery(db).FirstOrDefaultAsync(x => x.Id == roomId);
            if (room is null) return Results.NotFound();
            var requirement = await RequirementQuery(db).FirstOrDefaultAsync(x => x.CurricularCapabilityId == capabilityId);
            return Results.Ok(EnvironmentCompatibility.Evaluate(requirement, room, students, DateOnly.FromDateTime(DateTime.UtcNow)));
        });

        api.MapGet("/compatibility/rooms", async (int courseId, int moduleId,
            int unitId, int capabilityId, int? students, AppDbContext db) =>
        {
            if (!ValidStudents(students)) return Error("Quantidade de alunos inválida");
            if (!await CapabilityExists(db, courseId, moduleId, unitId, capabilityId)) return Results.NotFound();
            var requirement = await RequirementQuery(db).FirstOrDefaultAsync(x => x.CurricularCapabilityId == capabilityId);
            var rooms = await RoomQuery(db).ToListAsync();
            var results = rooms.Select(room => EnvironmentCompatibility.Evaluate(requirement, room, students,
                DateOnly.FromDateTime(DateTime.UtcNow))).OrderBy(x => x.Classification switch
                { "Compatible" => 0, "Partial" => 1, _ => 2 }).ThenBy(x => x.RoomName).ThenBy(x => x.RoomId);
            return Results.Ok(results);
        });
    }

    private static bool ValidStudents(int? students) => students is null or >= 1 and <= 1000;

    private static Task<bool> CapabilityExists(AppDbContext db, int courseId, int moduleId,
        int unitId, int capabilityId) => db.CurricularCapabilities.AnyAsync(x => x.Id == capabilityId &&
            x.CurricularUnitId == unitId && x.CurricularUnit.CourseModuleId == moduleId &&
            x.CurricularUnit.CourseModule.CourseId == courseId);

    private static IQueryable<CapabilityEnvironmentRequirement> RequirementQuery(AppDbContext db)
        => db.CapabilityEnvironmentRequirements.AsSplitQuery().Include(x => x.Resources)
            .Include(x => x.Software).ThenInclude(x => x.Software);

    private static IQueryable<Room> RoomQuery(AppDbContext db)
        => db.Rooms.AsNoTracking().AsSplitQuery().Include(x => x.Resources)
            .Include(x => x.ComputerGroups).ThenInclude(x => x.Software);

    private static async Task<string?> ValidateRequirements(AppDbContext db, CapabilityEnvironmentInput input)
    {
        if (input is null || input.Resources is null || input.Software is null ||
            (input.RoomKind is not null && !Enum.IsDefined(input.RoomKind.Value)) ||
            input.RequiredComputers is < 1 or > 1000 || input.MinRamGb is < 1 or > 4096 ||
            (input.MinRamGb is not null && input.RequiredComputers is null) ||
            (input.Software.Count > 0 && input.RequiredComputers is null) ||
            input.Resources.Count > 100 || input.Software.Count > 100)
            return "Requisitos de ambiente inválidos";
        var keys = new HashSet<(string, string)>();
        foreach (var resource in input.Resources)
        {
            if (string.IsNullOrWhiteSpace(resource.Name) || resource.Name.Trim().Length > 120 ||
                string.IsNullOrWhiteSpace(resource.Type) || resource.Type.Trim().Length > 80 ||
                resource.Quantity is < 1 or > 100000 ||
                !keys.Add((NormalizeInventoryKey(resource.Name), NormalizeInventoryKey(resource.Type))))
                return "Recurso exigido inválido ou repetido";
        }
        var ids = input.Software.Select(x => x.SoftwareId).ToArray();
        if (ids.Any(x => x <= 0) || ids.Distinct().Count() != ids.Length ||
            input.Software.Any(x => x.RequiredLicenses is < 1 or > 1000) ||
            await db.SoftwareCatalog.CountAsync(x => ids.Contains(x.Id)) != ids.Length)
            return "Software exigido inválido, repetido ou não cadastrado";
        return null;
    }

    private static CapabilityEnvironmentRequirement NewRequirement(int capabilityId, CapabilityEnvironmentInput input)
        => new()
        {
            CurricularCapabilityId = capabilityId, RoomKind = input.RoomKind,
            RequiresProjector = input.RequiresProjector, RequiredComputers = input.RequiredComputers,
            MinRamGb = input.MinRamGb, ComputersCritical = input.ComputersCritical,
            Resources = input.Resources.Select(x => new CapabilityResourceRequirement
            {
                CurricularCapabilityId = capabilityId, Name = x.Name.Trim(), Type = x.Type.Trim(),
                NormalizedName = NormalizeInventoryKey(x.Name), NormalizedType = NormalizeInventoryKey(x.Type),
                Quantity = x.Quantity, Critical = x.Critical
            }).ToList(),
            Software = input.Software.Select(x => new CapabilitySoftwareRequirement
            {
                CurricularCapabilityId = capabilityId, SoftwareId = x.SoftwareId,
                RequiredLicenses = x.RequiredLicenses, Critical = x.Critical
            }).ToList()
        };

    private static object RequirementView(CapabilityEnvironmentRequirement? item) => item is null
        ? new { Registered = false } : new
        {
            Registered = true, item.CurricularCapabilityId, item.RoomKind, item.RequiresProjector,
            item.RequiredComputers, item.MinRamGb, item.ComputersCritical,
            Resources = item.Resources.Select(x => new { x.Name, x.Type, x.Quantity, x.Critical }),
            Software = item.Software.Select(x => new { x.SoftwareId, x.RequiredLicenses, x.Critical })
        };
}
