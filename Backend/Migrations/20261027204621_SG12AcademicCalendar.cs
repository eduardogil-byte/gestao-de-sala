using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace SalaGest.Api.Migrations
{
    /// <inheritdoc />
    public partial class SG12AcademicCalendar : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<DateOnly>(
                name: "EadEndDate",
                table: "Classes",
                type: "date",
                nullable: true);

            migrationBuilder.AddColumn<DateOnly>(
                name: "EadStartDate",
                table: "Classes",
                type: "date",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "EadWeekday",
                table: "Classes",
                type: "int",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "AcademicCalendarEvents",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    SemesterId = table.Column<int>(type: "int", nullable: false),
                    StartDate = table.Column<DateOnly>(type: "date", nullable: false),
                    EndDate = table.Column<DateOnly>(type: "date", nullable: false),
                    Kind = table.Column<int>(type: "int", nullable: false),
                    Description = table.Column<string>(type: "nvarchar(250)", maxLength: 250, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_AcademicCalendarEvents", x => x.Id);
                    table.CheckConstraint("CK_AcademicCalendarEvents_Dates", "[StartDate] <= [EndDate]");
                    table.CheckConstraint("CK_AcademicCalendarEvents_Kind", "[Kind] BETWEEN 1 AND 6");
                    table.ForeignKey(
                        name: "FK_AcademicCalendarEvents_Semesters_SemesterId",
                        column: x => x.SemesterId,
                        principalTable: "Semesters",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "ClassCalendarExceptions",
                columns: table => new
                {
                    ClassGroupId = table.Column<int>(type: "int", nullable: false),
                    Date = table.Column<DateOnly>(type: "date", nullable: false),
                    Kind = table.Column<int>(type: "int", nullable: false),
                    Description = table.Column<string>(type: "nvarchar(250)", maxLength: 250, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ClassCalendarExceptions", x => new { x.ClassGroupId, x.Date });
                    table.CheckConstraint("CK_ClassCalendarExceptions_Kind", "[Kind] IN (1, 2, 6)");
                    table.ForeignKey(
                        name: "FK_ClassCalendarExceptions_Classes_ClassGroupId",
                        column: x => x.ClassGroupId,
                        principalTable: "Classes",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.AddCheckConstraint(
                name: "CK_Classes_EadPattern",
                table: "Classes",
                sql: "([EadWeekday] IS NULL AND [EadStartDate] IS NULL AND [EadEndDate] IS NULL) OR ([EadWeekday] IS NOT NULL AND [EadWeekday] BETWEEN 1 AND 5 AND [EadStartDate] IS NOT NULL AND [EadEndDate] IS NOT NULL AND [EadStartDate] <= [EadEndDate])");

            migrationBuilder.CreateIndex(
                name: "IX_AcademicCalendarEvents_SemesterId_StartDate_EndDate",
                table: "AcademicCalendarEvents",
                columns: new[] { "SemesterId", "StartDate", "EndDate" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "AcademicCalendarEvents");

            migrationBuilder.DropTable(
                name: "ClassCalendarExceptions");

            migrationBuilder.DropCheckConstraint(
                name: "CK_Classes_EadPattern",
                table: "Classes");

            migrationBuilder.DropColumn(
                name: "EadEndDate",
                table: "Classes");

            migrationBuilder.DropColumn(
                name: "EadStartDate",
                table: "Classes");

            migrationBuilder.DropColumn(
                name: "EadWeekday",
                table: "Classes");
        }
    }
}
