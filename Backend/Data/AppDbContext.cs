using Microsoft.AspNetCore.Identity.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore;
using SalaGest.Api.Models;

namespace SalaGest.Api.Data;

public sealed class AppDbContext(DbContextOptions<AppDbContext> options) : IdentityDbContext<AppUser>(options)
{
    public DbSet<Room> Rooms => Set<Room>();
    public DbSet<RoomOperatingShift> RoomOperatingShifts => Set<RoomOperatingShift>();
    public DbSet<RoomResource> RoomResources => Set<RoomResource>();
    public DbSet<ComputerGroup> ComputerGroups => Set<ComputerGroup>();
    public DbSet<Software> SoftwareCatalog => Set<Software>();
    public DbSet<GroupSoftware> GroupSoftware => Set<GroupSoftware>();
    public DbSet<Semester> Semesters => Set<Semester>();
    public DbSet<SchoolShift> Shifts => Set<SchoolShift>();
    public DbSet<ClassGroup> Classes => Set<ClassGroup>();
    public DbSet<TeacherAvailability> Availabilities => Set<TeacherAvailability>();
    public DbSet<TeachingAssignment> Assignments => Set<TeachingAssignment>();
    public DbSet<AssignmentSoftware> AssignmentSoftware => Set<AssignmentSoftware>();
    public DbSet<Schedule> Schedules => Set<Schedule>();
    public DbSet<WeeklyClass> WeeklyClasses => Set<WeeklyClass>();
    public DbSet<BookingRequest> Bookings => Set<BookingRequest>();
    public DbSet<BookingSoftware> BookingSoftware => Set<BookingSoftware>();
    public DbSet<RoomOccupation> Occupations => Set<RoomOccupation>();
    public DbSet<RoomLoan> Loans => Set<RoomLoan>();
    public DbSet<UserNotification> Notifications => Set<UserNotification>();
    public DbSet<OccupationChange> OccupationChanges => Set<OccupationChange>();
    public DbSet<AuditEntry> AuditEntries => Set<AuditEntry>();
    public DbSet<SemesterPlan> SemesterPlans => Set<SemesterPlan>();
    public DbSet<PlanProposal> PlanProposals => Set<PlanProposal>();
    public DbSet<Course> Courses => Set<Course>();
    public DbSet<CourseModule> CourseModules => Set<CourseModule>();
    public DbSet<CurricularUnit> CurricularUnits => Set<CurricularUnit>();
    public DbSet<CurricularCapability> CurricularCapabilities => Set<CurricularCapability>();
    public DbSet<CapabilityEnvironmentRequirement> CapabilityEnvironmentRequirements => Set<CapabilityEnvironmentRequirement>();
    public DbSet<CapabilityResourceRequirement> CapabilityResourceRequirements => Set<CapabilityResourceRequirement>();
    public DbSet<CapabilitySoftwareRequirement> CapabilitySoftwareRequirements => Set<CapabilitySoftwareRequirement>();
    public DbSet<TeacherCourseQualification> TeacherCourseQualifications => Set<TeacherCourseQualification>();
    public DbSet<TeacherUnitQualification> TeacherUnitQualifications => Set<TeacherUnitQualification>();
    public DbSet<TeacherCapabilityQualification> TeacherCapabilityQualifications => Set<TeacherCapabilityQualification>();
    public DbSet<AcademicCalendarEvent> AcademicCalendarEvents => Set<AcademicCalendarEvent>();
    public DbSet<ClassCalendarException> ClassCalendarExceptions => Set<ClassCalendarException>();

    protected override void OnModelCreating(ModelBuilder b)
    {
        base.OnModelCreating(b);
        b.Entity<AppUser>().Property(x => x.DisplayName).HasMaxLength(120);
        b.Entity<AppUser>().Property(x => x.Cpf).HasMaxLength(11);
        b.Entity<AppUser>().HasIndex(x => x.Cpf).IsUnique().HasFilter("[Cpf] IS NOT NULL");
        b.Entity<AppUser>().Property(x => x.Education).IsRequired().HasMaxLength(2000);
        b.Entity<AppUser>().Property(x => x.TechnicalSkills).IsRequired().HasMaxLength(2000);
        b.Entity<AppUser>().Property(x => x.ProfessionalKnowledge).IsRequired().HasMaxLength(2000);
        b.Entity<Room>().Property(x => x.Name).HasMaxLength(120);
        b.Entity<Room>().Property(x => x.Code).HasMaxLength(30);
        b.Entity<Room>().Property(x => x.NormalizedCode).HasMaxLength(30);
        b.Entity<Room>().HasIndex(x => x.NormalizedCode).IsUnique()
            .HasFilter("[NormalizedCode] IS NOT NULL");
        b.Entity<RoomOperatingShift>().HasKey(x => new { x.SemesterId, x.RoomId, x.ShiftId });
        b.Entity<RoomOperatingShift>().HasOne(x => x.Semester).WithMany()
            .HasForeignKey(x => x.SemesterId).OnDelete(DeleteBehavior.Restrict);
        b.Entity<RoomOperatingShift>().HasOne(x => x.Room).WithMany()
            .HasForeignKey(x => x.RoomId).OnDelete(DeleteBehavior.Restrict);
        b.Entity<RoomOperatingShift>().HasOne(x => x.Shift).WithMany()
            .HasForeignKey(x => x.ShiftId).OnDelete(DeleteBehavior.Restrict);
        b.Entity<RoomOperatingShift>().ToTable(t => t.HasCheckConstraint(
            "CK_RoomOperatingShifts_WeekdaysMask", "[WeekdaysMask] BETWEEN 1 AND 127"));
        b.Entity<Room>().Property(x => x.Location).HasMaxLength(160);
        b.Entity<Room>().Property(x => x.Purpose).HasMaxLength(350);
        b.Entity<ComputerGroup>().Property(x => x.Description).HasMaxLength(120);
        b.Entity<ComputerGroup>().Property(x => x.Processor).HasMaxLength(160);
        b.Entity<ComputerGroup>().Property(x => x.Storage).HasMaxLength(120);
        b.Entity<ComputerGroup>().Property(x => x.GraphicsCard).HasMaxLength(160);
        b.Entity<ComputerGroup>().Property(x => x.OperatingSystem).HasMaxLength(120);
        b.Entity<ComputerGroup>().Property(x => x.NetworkDetails).HasMaxLength(500);
        b.Entity<ComputerGroup>().ToTable(t => t.HasCheckConstraint("CK_ComputerGroups_OperationalQuantity",
            "[OperationalQuantity] IS NULL OR ([OperationalQuantity] >= 0 AND [OperationalQuantity] <= [Quantity])"));
        b.Entity<RoomResource>().Property(x => x.Name).IsRequired().HasMaxLength(120);
        b.Entity<RoomResource>().Property(x => x.NormalizedName).IsRequired().HasMaxLength(120);
        b.Entity<RoomResource>().Property(x => x.Type).IsRequired().HasMaxLength(80);
        b.Entity<RoomResource>().Property(x => x.NormalizedType).IsRequired().HasMaxLength(80);
        b.Entity<RoomResource>().Property(x => x.Description).HasMaxLength(500);
        b.Entity<RoomResource>().Property(x => x.Condition).HasMaxLength(80);
        b.Entity<RoomResource>().Property(x => x.TechnicalDetails).HasMaxLength(2000);
        b.Entity<RoomResource>().HasIndex(x => new { x.RoomId, x.NormalizedName, x.NormalizedType }).IsUnique();
        b.Entity<RoomResource>().HasOne(x => x.Room).WithMany(x => x.Resources)
            .HasForeignKey(x => x.RoomId).OnDelete(DeleteBehavior.Restrict);
        b.Entity<RoomResource>().ToTable(t =>
        {
            t.HasCheckConstraint("CK_RoomResources_Quantity", "[Quantity] >= 0");
            t.HasCheckConstraint("CK_RoomResources_OperationalQuantity",
                "[OperationalQuantity] IS NULL OR ([OperationalQuantity] >= 0 AND [OperationalQuantity] <= [Quantity])");
            t.HasCheckConstraint("CK_RoomResources_Voltage", "[Voltage] IS NULL OR [Voltage] BETWEEN 1 AND 1000");
        });
        b.Entity<Software>().Property(x => x.Name).HasMaxLength(100);
        b.Entity<Software>().HasIndex(x => x.Name).IsUnique();
        b.Entity<GroupSoftware>().Property(x => x.Version).HasMaxLength(80);
        b.Entity<GroupSoftware>().ToTable(t => t.HasCheckConstraint("CK_GroupSoftware_Quantities",
            "[InstalledQuantity] >= 1 AND ([LicenseQuantity] IS NULL OR [LicenseQuantity] >= 1)"));
        b.Entity<SchoolShift>().Property(x => x.Name).HasMaxLength(60);
        b.Entity<ClassGroup>().Property(x => x.Name).HasMaxLength(100);
        b.Entity<ClassGroup>().HasOne(x => x.Course).WithMany()
            .HasForeignKey(x => x.CourseId).OnDelete(DeleteBehavior.Restrict);
        b.Entity<ClassGroup>().ToTable(t => t.HasCheckConstraint("CK_Classes_EadPattern",
            "([EadWeekday] IS NULL AND [EadStartDate] IS NULL AND [EadEndDate] IS NULL) OR " +
            "([EadWeekday] IS NOT NULL AND [EadWeekday] BETWEEN 1 AND 5 AND [EadStartDate] IS NOT NULL AND " +
            "[EadEndDate] IS NOT NULL AND [EadStartDate] <= [EadEndDate])"));
        b.Entity<TeachingAssignment>().Property(x => x.DisciplineName).HasMaxLength(140);
        b.Entity<TeachingAssignment>().HasOne(x => x.CurricularUnit).WithMany()
            .HasForeignKey(x => x.CurricularUnitId).OnDelete(DeleteBehavior.Restrict);
        b.Entity<TeachingAssignment>().HasIndex(x => new
            { x.ClassGroupId, x.TeacherId, x.CurricularUnitId, x.Weekday, x.PreferredShiftId })
            .IsUnique().HasFilter("[CurricularUnitId] IS NOT NULL AND [EndedAtUtc] IS NULL");
        b.Entity<TeachingAssignment>().ToTable(t => t.HasCheckConstraint("CK_Assignments_PedagogicalSlot",
            "[CurricularUnitId] IS NULL OR ([Weekday] IS NOT NULL AND [Weekday] BETWEEN 1 AND 5 AND [PreferredShiftId] IS NOT NULL)"));
        b.Entity<Semester>().Property(x => x.Name).HasMaxLength(100);

        b.Entity<GroupSoftware>().HasKey(x => new { x.ComputerGroupId, x.SoftwareId });
        b.Entity<BookingRequest>().HasOne(x => x.CurricularUnit).WithMany()
            .HasForeignKey(x => x.CurricularUnitId).OnDelete(DeleteBehavior.Restrict);
        b.Entity<BookingRequest>().HasOne(x => x.CurricularCapability).WithMany()
            .HasForeignKey(x => x.CurricularCapabilityId).OnDelete(DeleteBehavior.Restrict);
        b.Entity<AssignmentSoftware>().HasKey(x => new { x.TeachingAssignmentId, x.SoftwareId });
        b.Entity<BookingSoftware>().HasKey(x => new { x.BookingRequestId, x.SoftwareId });
        b.Entity<TeacherAvailability>().HasIndex(x => new { x.TeacherId, x.Weekday, x.ShiftId }).IsUnique();
        b.Entity<RoomOccupation>().HasIndex(x => new { x.RoomId, x.StartsAt, x.EndsAt });
        b.Entity<RoomOccupation>().HasOne<PlanProposal>().WithMany().HasForeignKey(x => x.PlanProposalId)
            .OnDelete(DeleteBehavior.Restrict);
        b.Entity<RoomOccupation>().HasIndex(x => new { x.PlanProposalId, x.StartsAt }).IsUnique()
            .HasFilter("[PlanProposalId] IS NOT NULL");
        b.Entity<SemesterPlan>().HasOne(x => x.Semester).WithMany().HasForeignKey(x => x.SemesterId)
            .OnDelete(DeleteBehavior.Restrict);
        b.Entity<SemesterPlan>().HasIndex(x => x.SemesterId).IsUnique();
        b.Entity<PlanProposal>().HasOne(x => x.SemesterPlan).WithMany(x => x.Proposals)
            .HasForeignKey(x => x.SemesterPlanId).OnDelete(DeleteBehavior.Restrict);
        b.Entity<PlanProposal>().HasOne(x => x.Assignment).WithMany().HasForeignKey(x => x.AssignmentId)
            .OnDelete(DeleteBehavior.Restrict);
        b.Entity<PlanProposal>().HasOne(x => x.CurricularCapability).WithMany()
            .HasForeignKey(x => x.CurricularCapabilityId).OnDelete(DeleteBehavior.Restrict);
        b.Entity<PlanProposal>().HasOne(x => x.Room).WithMany().HasForeignKey(x => x.RoomId)
            .OnDelete(DeleteBehavior.Restrict);
        b.Entity<PlanProposal>().HasOne(x => x.Shift).WithMany().HasForeignKey(x => x.ShiftId)
            .OnDelete(DeleteBehavior.Restrict);
        b.Entity<PlanProposal>().Property(x => x.CreatedById).HasMaxLength(450);
        b.Entity<PlanProposal>().Property(x => x.DecidedById).HasMaxLength(450);
        b.Entity<PlanProposal>().Property(x => x.RejectionReason).HasMaxLength(500);
        b.Entity<PlanProposal>().HasIndex(x => new { x.SemesterPlanId, x.Status });
        b.Entity<RoomOccupation>().HasIndex(x => new { x.TeacherId, x.StartsAt, x.EndsAt });
        b.Entity<RoomLoan>().HasIndex(x => x.RoomOccupationId);
        b.Entity<UserNotification>().HasIndex(x => new { x.UserId, x.CreatedAtUtc });
        b.Entity<OccupationChange>().HasIndex(x => new { x.RoomOccupationId, x.ChangedAtUtc });
        b.Entity<AuditEntry>().HasIndex(x => new { x.EntityType, x.EntityId, x.CreatedAtUtc });
        b.Entity<AuditEntry>().Property(x => x.EntityType).HasMaxLength(32);
        b.Entity<AuditEntry>().Property(x => x.EntityId).HasMaxLength(128);
        b.Entity<AuditEntry>().Property(x => x.Action).HasMaxLength(60);
        b.Entity<AuditEntry>().Property(x => x.ActorId).HasMaxLength(450);
        b.Entity<AuditEntry>().Property(x => x.Reason).HasMaxLength(500);
        b.Entity<UserNotification>().Property(x => x.Subject).HasMaxLength(120);
        b.Entity<UserNotification>().Property(x => x.RelatedType).HasMaxLength(32);

        b.Entity<Course>().Property(x => x.Code).IsRequired().HasMaxLength(30);
        b.Entity<Course>().Property(x => x.NormalizedCode).IsRequired().HasMaxLength(30);
        b.Entity<Course>().Property(x => x.Name).IsRequired().HasMaxLength(160);
        b.Entity<Course>().Property(x => x.NormalizedName).IsRequired().HasMaxLength(160);
        b.Entity<Course>().HasIndex(x => x.NormalizedCode).IsUnique();
        b.Entity<Course>().HasIndex(x => x.NormalizedName).IsUnique();

        b.Entity<CourseModule>().Property(x => x.Name).IsRequired().HasMaxLength(120);
        b.Entity<CourseModule>().Property(x => x.NormalizedName).IsRequired().HasMaxLength(120);
        b.Entity<CourseModule>().HasIndex(x => new { x.CourseId, x.NormalizedName }).IsUnique();
        b.Entity<CourseModule>().HasIndex(x => new { x.CourseId, x.Order }).IsUnique();
        b.Entity<CourseModule>().HasOne(x => x.Course).WithMany(x => x.Modules)
            .HasForeignKey(x => x.CourseId).OnDelete(DeleteBehavior.Restrict);
        b.Entity<CourseModule>().ToTable(t => t.HasCheckConstraint("CK_CourseModules_Order", "[Order] > 0"));

        b.Entity<CurricularUnit>().Property(x => x.Code).IsRequired().HasMaxLength(30);
        b.Entity<CurricularUnit>().Property(x => x.NormalizedCode).IsRequired().HasMaxLength(30);
        b.Entity<CurricularUnit>().Property(x => x.Name).IsRequired().HasMaxLength(160);
        b.Entity<CurricularUnit>().Property(x => x.NormalizedName).IsRequired().HasMaxLength(160);
        b.Entity<CurricularUnit>().Property(x => x.PlannedHours).HasPrecision(9, 2);
        b.Entity<CurricularUnit>().ToTable(t => t.HasCheckConstraint("CK_CurricularUnits_PlannedHours",
            "[PlannedHours] IS NULL OR ([PlannedHours] > 0 AND [PlannedHours] <= 9999999.99)"));
        b.Entity<CurricularUnit>().HasIndex(x => new { x.CourseModuleId, x.NormalizedCode }).IsUnique();
        b.Entity<CurricularUnit>().HasIndex(x => new { x.CourseModuleId, x.NormalizedName }).IsUnique();
        b.Entity<CurricularUnit>().HasOne(x => x.CourseModule).WithMany(x => x.CurricularUnits)
            .HasForeignKey(x => x.CourseModuleId).OnDelete(DeleteBehavior.Restrict);

        b.Entity<CurricularCapability>().Property(x => x.Description).IsRequired().HasMaxLength(300);
        b.Entity<CurricularCapability>().Property(x => x.NormalizedDescription).IsRequired().HasMaxLength(300);
        b.Entity<CurricularCapability>().Property(x => x.Contents).IsRequired().HasMaxLength(4000);
        b.Entity<CurricularCapability>().Property(x => x.RequiredHours).HasPrecision(9, 2);
        b.Entity<CurricularCapability>().HasIndex(x => new { x.CurricularUnitId, x.NormalizedDescription }).IsUnique();
        b.Entity<CurricularCapability>().HasIndex(x => new { x.CurricularUnitId, x.Order }).IsUnique();
        b.Entity<CurricularCapability>().HasOne(x => x.CurricularUnit).WithMany(x => x.Capabilities)
            .HasForeignKey(x => x.CurricularUnitId).OnDelete(DeleteBehavior.Restrict);
        b.Entity<CurricularCapability>().ToTable(t =>
        {
            t.HasCheckConstraint("CK_CurricularCapabilities_Order", "[Order] > 0");
            t.HasCheckConstraint("CK_CurricularCapabilities_RequiredHours",
                "[RequiredHours] > 0 AND [RequiredHours] <= 9999999.99");
        });

        b.Entity<CapabilityEnvironmentRequirement>().HasKey(x => x.CurricularCapabilityId);
        b.Entity<CapabilityEnvironmentRequirement>().HasOne(x => x.CurricularCapability)
            .WithOne(x => x.EnvironmentRequirement).HasForeignKey<CapabilityEnvironmentRequirement>(x => x.CurricularCapabilityId)
            .OnDelete(DeleteBehavior.Restrict);
        b.Entity<CapabilityEnvironmentRequirement>().ToTable(t => t.HasCheckConstraint(
            "CK_CapabilityEnvironmentRequirements_Computers",
            "([RequiredComputers] IS NULL OR [RequiredComputers] > 0) AND ([MinRamGb] IS NULL OR [MinRamGb] > 0)"));
        b.Entity<CapabilityResourceRequirement>().Property(x => x.Name).IsRequired().HasMaxLength(120);
        b.Entity<CapabilityResourceRequirement>().Property(x => x.Type).IsRequired().HasMaxLength(80);
        b.Entity<CapabilityResourceRequirement>().Property(x => x.NormalizedName).IsRequired().HasMaxLength(120);
        b.Entity<CapabilityResourceRequirement>().Property(x => x.NormalizedType).IsRequired().HasMaxLength(80);
        b.Entity<CapabilityResourceRequirement>().HasIndex(x => new { x.CurricularCapabilityId, x.NormalizedName, x.NormalizedType }).IsUnique();
        b.Entity<CapabilityResourceRequirement>().HasOne(x => x.EnvironmentRequirement).WithMany(x => x.Resources)
            .HasForeignKey(x => x.CurricularCapabilityId).OnDelete(DeleteBehavior.Restrict);
        b.Entity<CapabilityResourceRequirement>().ToTable(t => t.HasCheckConstraint("CK_CapabilityResourceRequirements_Quantity", "[Quantity] > 0"));
        b.Entity<CapabilitySoftwareRequirement>().HasKey(x => new { x.CurricularCapabilityId, x.SoftwareId });
        b.Entity<CapabilitySoftwareRequirement>().HasOne(x => x.EnvironmentRequirement).WithMany(x => x.Software)
            .HasForeignKey(x => x.CurricularCapabilityId).OnDelete(DeleteBehavior.Restrict);
        b.Entity<CapabilitySoftwareRequirement>().HasOne(x => x.Software).WithMany()
            .HasForeignKey(x => x.SoftwareId).OnDelete(DeleteBehavior.Restrict);
        b.Entity<CapabilitySoftwareRequirement>().ToTable(t => t.HasCheckConstraint(
            "CK_CapabilitySoftwareRequirements_Licenses", "[RequiredLicenses] IS NULL OR [RequiredLicenses] > 0"));

        b.Entity<TeacherCourseQualification>().HasKey(x => new { x.TeacherId, x.CourseId });
        b.Entity<TeacherCourseQualification>().HasOne(x => x.Teacher).WithMany()
            .HasForeignKey(x => x.TeacherId).OnDelete(DeleteBehavior.Restrict);
        b.Entity<TeacherCourseQualification>().HasOne(x => x.Course).WithMany()
            .HasForeignKey(x => x.CourseId).OnDelete(DeleteBehavior.Restrict);
        b.Entity<TeacherUnitQualification>().HasKey(x => new { x.TeacherId, x.CurricularUnitId });
        b.Entity<TeacherUnitQualification>().HasOne(x => x.Teacher).WithMany()
            .HasForeignKey(x => x.TeacherId).OnDelete(DeleteBehavior.Restrict);
        b.Entity<TeacherUnitQualification>().HasOne(x => x.CurricularUnit).WithMany()
            .HasForeignKey(x => x.CurricularUnitId).OnDelete(DeleteBehavior.Restrict);
        b.Entity<TeacherCapabilityQualification>().HasKey(x => new { x.TeacherId, x.CurricularCapabilityId });
        b.Entity<TeacherCapabilityQualification>().HasOne(x => x.Teacher).WithMany()
            .HasForeignKey(x => x.TeacherId).OnDelete(DeleteBehavior.Restrict);
        b.Entity<TeacherCapabilityQualification>().HasOne(x => x.CurricularCapability).WithMany()
            .HasForeignKey(x => x.CurricularCapabilityId).OnDelete(DeleteBehavior.Restrict);

        b.Entity<AcademicCalendarEvent>().Property(x => x.Description).IsRequired().HasMaxLength(250);
        b.Entity<AcademicCalendarEvent>().HasIndex(x => new { x.SemesterId, x.StartDate, x.EndDate }).IsUnique();
        b.Entity<AcademicCalendarEvent>().HasOne(x => x.Semester).WithMany()
            .HasForeignKey(x => x.SemesterId).OnDelete(DeleteBehavior.Restrict);
        b.Entity<AcademicCalendarEvent>().ToTable(t =>
        {
            t.HasCheckConstraint("CK_AcademicCalendarEvents_Dates", "[StartDate] <= [EndDate]");
            t.HasCheckConstraint("CK_AcademicCalendarEvents_Kind", "[Kind] BETWEEN 1 AND 6");
        });
        b.Entity<ClassCalendarException>().HasKey(x => new { x.ClassGroupId, x.Date });
        b.Entity<ClassCalendarException>().Property(x => x.Description).IsRequired().HasMaxLength(250);
        b.Entity<ClassCalendarException>().HasOne(x => x.ClassGroup).WithMany()
            .HasForeignKey(x => x.ClassGroupId).OnDelete(DeleteBehavior.Restrict);
        b.Entity<ClassCalendarException>().ToTable(t => t.HasCheckConstraint("CK_ClassCalendarExceptions_Kind",
            "[Kind] IN (1, 2, 6)"));

        // Restringimos exclusões para proteger o histórico de agendas e evitar caminhos de cascata no SQL Server.
        foreach (var entity in b.Model.GetEntityTypes())
        {
            foreach (var fk in entity.GetForeignKeys())
            {
                fk.DeleteBehavior = DeleteBehavior.Restrict;
            }
        }
    }
}
