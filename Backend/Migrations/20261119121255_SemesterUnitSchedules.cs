using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace SalaGest.Api.Migrations
{
    /// <inheritdoc />
    public partial class SemesterUnitSchedules : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<decimal>(
                name: "PedagogicalHours",
                table: "Shifts",
                type: "decimal(9,2)",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "ScheduleUnitMeetingId",
                table: "Occupations",
                type: "int",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "ScheduleUnitPlans",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    ScheduleId = table.Column<int>(type: "int", nullable: false),
                    ClassGroupId = table.Column<int>(type: "int", nullable: false),
                    CurricularUnitId = table.Column<int>(type: "int", nullable: false),
                    TeacherId = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    PlannedHours = table.Column<decimal>(type: "decimal(9,2)", nullable: true),
                    AllocatedHours = table.Column<decimal>(type: "decimal(9,2)", nullable: false),
                    PendingReason = table.Column<string>(type: "nvarchar(1000)", maxLength: 1000, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ScheduleUnitPlans", x => x.Id);
                    table.ForeignKey(
                        name: "FK_ScheduleUnitPlans_ClassUnitOfferings_ClassGroupId_CurricularUnitId",
                        columns: x => new { x.ClassGroupId, x.CurricularUnitId },
                        principalTable: "ClassUnitOfferings",
                        principalColumns: new[] { "ClassGroupId", "CurricularUnitId" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_ScheduleUnitPlans_Schedules_ScheduleId",
                        column: x => x.ScheduleId,
                        principalTable: "Schedules",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "ScheduleUnitMeetings",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    ScheduleUnitPlanId = table.Column<int>(type: "int", nullable: false),
                    Date = table.Column<DateOnly>(type: "date", nullable: true),
                    ShiftId = table.Column<int>(type: "int", nullable: true),
                    RoomId = table.Column<int>(type: "int", nullable: true),
                    PlannedHours = table.Column<decimal>(type: "decimal(9,2)", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ScheduleUnitMeetings", x => x.Id);
                    table.CheckConstraint("CK_ScheduleUnitMeetings_Mode", "([Date] IS NULL AND [ShiftId] IS NULL AND [RoomId] IS NULL) OR ([Date] IS NOT NULL AND [ShiftId] IS NOT NULL)");
                    table.ForeignKey(
                        name: "FK_ScheduleUnitMeetings_Rooms_RoomId",
                        column: x => x.RoomId,
                        principalTable: "Rooms",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_ScheduleUnitMeetings_ScheduleUnitPlans_ScheduleUnitPlanId",
                        column: x => x.ScheduleUnitPlanId,
                        principalTable: "ScheduleUnitPlans",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_ScheduleUnitMeetings_Shifts_ShiftId",
                        column: x => x.ShiftId,
                        principalTable: "Shifts",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.AddCheckConstraint(
                name: "CK_Shifts_PedagogicalHours",
                table: "Shifts",
                sql: "[PedagogicalHours] IS NULL OR ([PedagogicalHours] > 0 AND [PedagogicalHours] <= 24)");

            migrationBuilder.CreateIndex(
                name: "IX_Occupations_ScheduleUnitMeetingId",
                table: "Occupations",
                column: "ScheduleUnitMeetingId",
                unique: true,
                filter: "[ScheduleUnitMeetingId] IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_ScheduleUnitMeetings_Date_ShiftId_RoomId",
                table: "ScheduleUnitMeetings",
                columns: new[] { "Date", "ShiftId", "RoomId" });

            migrationBuilder.CreateIndex(
                name: "IX_ScheduleUnitMeetings_RoomId",
                table: "ScheduleUnitMeetings",
                column: "RoomId");

            migrationBuilder.CreateIndex(
                name: "IX_ScheduleUnitMeetings_ScheduleUnitPlanId",
                table: "ScheduleUnitMeetings",
                column: "ScheduleUnitPlanId");

            migrationBuilder.CreateIndex(
                name: "IX_ScheduleUnitMeetings_ShiftId",
                table: "ScheduleUnitMeetings",
                column: "ShiftId");

            migrationBuilder.CreateIndex(
                name: "IX_ScheduleUnitPlans_ClassGroupId_CurricularUnitId",
                table: "ScheduleUnitPlans",
                columns: new[] { "ClassGroupId", "CurricularUnitId" });

            migrationBuilder.CreateIndex(
                name: "IX_ScheduleUnitPlans_ScheduleId_ClassGroupId_CurricularUnitId",
                table: "ScheduleUnitPlans",
                columns: new[] { "ScheduleId", "ClassGroupId", "CurricularUnitId" },
                unique: true);

            migrationBuilder.AddForeignKey(
                name: "FK_Occupations_ScheduleUnitMeetings_ScheduleUnitMeetingId",
                table: "Occupations",
                column: "ScheduleUnitMeetingId",
                principalTable: "ScheduleUnitMeetings",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_Occupations_ScheduleUnitMeetings_ScheduleUnitMeetingId",
                table: "Occupations");

            migrationBuilder.DropTable(
                name: "ScheduleUnitMeetings");

            migrationBuilder.DropTable(
                name: "ScheduleUnitPlans");

            migrationBuilder.DropCheckConstraint(
                name: "CK_Shifts_PedagogicalHours",
                table: "Shifts");

            migrationBuilder.DropIndex(
                name: "IX_Occupations_ScheduleUnitMeetingId",
                table: "Occupations");

            migrationBuilder.DropColumn(
                name: "PedagogicalHours",
                table: "Shifts");

            migrationBuilder.DropColumn(
                name: "ScheduleUnitMeetingId",
                table: "Occupations");
        }
    }
}
