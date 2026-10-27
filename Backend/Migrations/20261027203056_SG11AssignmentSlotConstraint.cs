using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace SalaGest.Api.Migrations
{
    /// <inheritdoc />
    public partial class SG11AssignmentSlotConstraint : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropCheckConstraint(
                name: "CK_Assignments_PedagogicalSlot",
                table: "Assignments");

            migrationBuilder.AddCheckConstraint(
                name: "CK_Assignments_PedagogicalSlot",
                table: "Assignments",
                sql: "[CurricularUnitId] IS NULL OR ([Weekday] IS NOT NULL AND [Weekday] BETWEEN 1 AND 5 AND [PreferredShiftId] IS NOT NULL)");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropCheckConstraint(
                name: "CK_Assignments_PedagogicalSlot",
                table: "Assignments");

            migrationBuilder.AddCheckConstraint(
                name: "CK_Assignments_PedagogicalSlot",
                table: "Assignments",
                sql: "[CurricularUnitId] IS NULL OR ([Weekday] BETWEEN 1 AND 5 AND [PreferredShiftId] IS NOT NULL)");
        }
    }
}
