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
