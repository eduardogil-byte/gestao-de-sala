using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace SalaGest.Api.Migrations
{
    /// <inheritdoc />
    public partial class SG11TeacherClassAssignments : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_Assignments_ClassGroupId",
                table: "Assignments");

            migrationBuilder.AddColumn<int>(
                name: "CourseId",
                table: "Classes",
                type: "int",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "CurricularUnitId",
                table: "Assignments",
                type: "int",
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "EndedAtUtc",
                table: "Assignments",
                type: "datetime2",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "Weekday",
                table: "Assignments",
                type: "int",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_Classes_CourseId",
                table: "Classes",
                column: "CourseId");

            migrationBuilder.CreateIndex(
                name: "IX_Assignments_ClassGroupId_TeacherId_CurricularUnitId_Weekday_PreferredShiftId",
                table: "Assignments",
                columns: new[] { "ClassGroupId", "TeacherId", "CurricularUnitId", "Weekday", "PreferredShiftId" },
                unique: true,
                filter: "[CurricularUnitId] IS NOT NULL AND [EndedAtUtc] IS NULL");

            migrationBuilder.CreateIndex(
                name: "IX_Assignments_CurricularUnitId",
                table: "Assignments",
                column: "CurricularUnitId");

            migrationBuilder.AddCheckConstraint(
                name: "CK_Assignments_PedagogicalSlot",
                table: "Assignments",
                sql: "[CurricularUnitId] IS NULL OR ([Weekday] BETWEEN 1 AND 5 AND [PreferredShiftId] IS NOT NULL)");

            migrationBuilder.AddForeignKey(
                name: "FK_Assignments_CurricularUnits_CurricularUnitId",
                table: "Assignments",
                column: "CurricularUnitId",
                principalTable: "CurricularUnits",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "FK_Classes_Courses_CourseId",
                table: "Classes",
                column: "CourseId",
                principalTable: "Courses",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_Assignments_CurricularUnits_CurricularUnitId",
                table: "Assignments");

            migrationBuilder.DropForeignKey(
                name: "FK_Classes_Courses_CourseId",
                table: "Classes");

            migrationBuilder.DropIndex(
                name: "IX_Classes_CourseId",
                table: "Classes");

            migrationBuilder.DropIndex(
                name: "IX_Assignments_ClassGroupId_TeacherId_CurricularUnitId_Weekday_PreferredShiftId",
                table: "Assignments");

            migrationBuilder.DropIndex(
                name: "IX_Assignments_CurricularUnitId",
                table: "Assignments");

            migrationBuilder.DropCheckConstraint(
                name: "CK_Assignments_PedagogicalSlot",
                table: "Assignments");

            migrationBuilder.DropColumn(
                name: "CourseId",
                table: "Classes");

            migrationBuilder.DropColumn(
                name: "CurricularUnitId",
                table: "Assignments");

            migrationBuilder.DropColumn(
                name: "EndedAtUtc",
                table: "Assignments");

            migrationBuilder.DropColumn(
                name: "Weekday",
                table: "Assignments");

            migrationBuilder.CreateIndex(
                name: "IX_Assignments_ClassGroupId",
                table: "Assignments",
                column: "ClassGroupId");
        }
    }
}
