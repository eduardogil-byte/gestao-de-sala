using Microsoft.AspNetCore.Identity.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore;
using SalaGest.Api.Models;

namespace SalaGest.Api.Data;

public sealed class AppDbContext(DbContextOptions<AppDbContext> options) : IdentityDbContext<AppUser>(options)
{
    public DbSet<Room> Rooms => Set<Room>();
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
    public DbSet<Course> Courses => Set<Course>();
    public DbSet<CourseModule> CourseModules => Set<CourseModule>();
    public DbSet<CurricularUnit> CurricularUnits => Set<CurricularUnit>();
    public DbSet<CurricularCapability> CurricularCapabilities => Set<CurricularCapability>();

    protected override void OnModelCreating(ModelBuilder b)
    {
        base.OnModelCreating(b);
        b.Entity<AppUser>().Property(x => x.DisplayName).HasMaxLength(120);
        b.Entity<Room>().Property(x => x.Name).HasMaxLength(120);
        b.Entity<Room>().Property(x => x.Location).HasMaxLength(160);
        b.Entity<Room>().Property(x => x.Purpose).HasMaxLength(350);
        b.Entity<ComputerGroup>().Property(x => x.Description).HasMaxLength(120);
        b.Entity<Software>().Property(x => x.Name).HasMaxLength(100);
        b.Entity<Software>().HasIndex(x => x.Name).IsUnique();
        b.Entity<SchoolShift>().Property(x => x.Name).HasMaxLength(60);
        b.Entity<ClassGroup>().Property(x => x.Name).HasMaxLength(100);
        b.Entity<TeachingAssignment>().Property(x => x.DisciplineName).HasMaxLength(140);
        b.Entity<Semester>().Property(x => x.Name).HasMaxLength(100);

        b.Entity<GroupSoftware>().HasKey(x => new { x.ComputerGroupId, x.SoftwareId });
        b.Entity<AssignmentSoftware>().HasKey(x => new { x.TeachingAssignmentId, x.SoftwareId });
        b.Entity<BookingSoftware>().HasKey(x => new { x.BookingRequestId, x.SoftwareId });
        b.Entity<TeacherAvailability>().HasIndex(x => new { x.TeacherId, x.Weekday, x.ShiftId }).IsUnique();
        b.Entity<RoomOccupation>().HasIndex(x => new { x.RoomId, x.StartsAt, x.EndsAt });
        b.Entity<RoomOccupation>().HasIndex(x => new { x.TeacherId, x.StartsAt, x.EndsAt });
        b.Entity<RoomLoan>().HasIndex(x => x.RoomOccupationId);
        b.Entity<UserNotification>().HasIndex(x => new { x.UserId, x.CreatedAtUtc });
        b.Entity<OccupationChange>().HasIndex(x => new { x.RoomOccupationId, x.ChangedAtUtc });

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
