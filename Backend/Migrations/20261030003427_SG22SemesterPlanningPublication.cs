using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace SalaGest.Api.Migrations
{
    /// <inheritdoc />
    public partial class SG22SemesterPlanningPublication : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "PlanProposalId",
                table: "Occupations",
                type: "int",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "SemesterPlans",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    SemesterId = table.Column<int>(type: "int", nullable: false),
                    Published = table.Column<bool>(type: "bit", nullable: false),
                    Revision = table.Column<int>(type: "int", nullable: false),
                    CreatedAtUtc = table.Column<DateTime>(type: "datetime2", nullable: false),
                    PublishedAtUtc = table.Column<DateTime>(type: "datetime2", nullable: true),
                    PublishedById = table.Column<string>(type: "nvarchar(max)", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_SemesterPlans", x => x.Id);
                    table.ForeignKey(
                        name: "FK_SemesterPlans_Semesters_SemesterId",
                        column: x => x.SemesterId,
                        principalTable: "Semesters",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "PlanProposals",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    SemesterPlanId = table.Column<int>(type: "int", nullable: false),
                    AssignmentId = table.Column<int>(type: "int", nullable: false),
                    CurricularCapabilityId = table.Column<int>(type: "int", nullable: true),
                    RoomId = table.Column<int>(type: "int", nullable: false),
                    ShiftId = table.Column<int>(type: "int", nullable: false),
                    StartDate = table.Column<DateOnly>(type: "date", nullable: false),
                    EndDate = table.Column<DateOnly>(type: "date", nullable: false),
                    Status = table.Column<int>(type: "int", nullable: false),
                    CreatedById = table.Column<string>(type: "nvarchar(450)", maxLength: 450, nullable: false),
                    CreatedAtUtc = table.Column<DateTime>(type: "datetime2", nullable: false),
                    DecidedById = table.Column<string>(type: "nvarchar(450)", maxLength: 450, nullable: true),
                    DecidedAtUtc = table.Column<DateTime>(type: "datetime2", nullable: true),
                    RejectionReason = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PlanProposals", x => x.Id);
                    table.ForeignKey(
                        name: "FK_PlanProposals_Assignments_AssignmentId",
                        column: x => x.AssignmentId,
                        principalTable: "Assignments",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_PlanProposals_CurricularCapabilities_CurricularCapabilityId",
                        column: x => x.CurricularCapabilityId,
                        principalTable: "CurricularCapabilities",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_PlanProposals_Rooms_RoomId",
                        column: x => x.RoomId,
                        principalTable: "Rooms",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_PlanProposals_SemesterPlans_SemesterPlanId",
                        column: x => x.SemesterPlanId,
                        principalTable: "SemesterPlans",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_PlanProposals_Shifts_ShiftId",
                        column: x => x.ShiftId,
                        principalTable: "Shifts",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_Occupations_PlanProposalId_StartsAt",
                table: "Occupations",
                columns: new[] { "PlanProposalId", "StartsAt" },
                unique: true,
                filter: "[PlanProposalId] IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_PlanProposals_AssignmentId",
                table: "PlanProposals",
                column: "AssignmentId");

            migrationBuilder.CreateIndex(
                name: "IX_PlanProposals_CurricularCapabilityId",
                table: "PlanProposals",
                column: "CurricularCapabilityId");

            migrationBuilder.CreateIndex(
                name: "IX_PlanProposals_RoomId",
                table: "PlanProposals",
                column: "RoomId");

            migrationBuilder.CreateIndex(
                name: "IX_PlanProposals_SemesterPlanId_Status",
                table: "PlanProposals",
                columns: new[] { "SemesterPlanId", "Status" });

            migrationBuilder.CreateIndex(
                name: "IX_PlanProposals_ShiftId",
                table: "PlanProposals",
                column: "ShiftId");

            migrationBuilder.CreateIndex(
                name: "IX_SemesterPlans_SemesterId",
                table: "SemesterPlans",
                column: "SemesterId",
                unique: true);

            migrationBuilder.AddForeignKey(
                name: "FK_Occupations_PlanProposals_PlanProposalId",
                table: "Occupations",
                column: "PlanProposalId",
                principalTable: "PlanProposals",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_Occupations_PlanProposals_PlanProposalId",
                table: "Occupations");

            migrationBuilder.DropTable(
                name: "PlanProposals");

            migrationBuilder.DropTable(
                name: "SemesterPlans");

            migrationBuilder.DropIndex(
                name: "IX_Occupations_PlanProposalId_StartsAt",
                table: "Occupations");

            migrationBuilder.DropColumn(
                name: "PlanProposalId",
                table: "Occupations");
        }
    }
}
