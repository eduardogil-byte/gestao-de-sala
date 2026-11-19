using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace SalaGest.Api.Migrations
{
    /// <inheritdoc />
    public partial class ClassModuleUnitOfferings : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "CourseModuleId",
                table: "Classes",
                type: "int",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "ClassUnitOfferings",
                columns: table => new
                {
                    ClassGroupId = table.Column<int>(type: "int", nullable: false),
                    CurricularUnitId = table.Column<int>(type: "int", nullable: false),
                    DeliveryMode = table.Column<int>(type: "int", nullable: false),
                    EadScheduleMode = table.Column<int>(type: "int", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ClassUnitOfferings", x => new { x.ClassGroupId, x.CurricularUnitId });
                    table.CheckConstraint("CK_ClassUnitOfferings_Delivery", "([DeliveryMode] = 1 AND [EadScheduleMode] IS NULL) OR ([DeliveryMode] = 2 AND [EadScheduleMode] IN (1, 2))");
                    table.ForeignKey(
                        name: "FK_ClassUnitOfferings_Classes_ClassGroupId",
                        column: x => x.ClassGroupId,
                        principalTable: "Classes",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_ClassUnitOfferings_CurricularUnits_CurricularUnitId",
                        column: x => x.CurricularUnitId,
                        principalTable: "CurricularUnits",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_Classes_CourseModuleId",
                table: "Classes",
                column: "CourseModuleId");

            migrationBuilder.CreateIndex(
                name: "IX_ClassUnitOfferings_CurricularUnitId",
                table: "ClassUnitOfferings",
                column: "CurricularUnitId");

            migrationBuilder.AddForeignKey(
                name: "FK_Classes_CourseModules_CourseModuleId",
                table: "Classes",
                column: "CourseModuleId",
                principalTable: "CourseModules",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_Classes_CourseModules_CourseModuleId",
                table: "Classes");

            migrationBuilder.DropTable(
                name: "ClassUnitOfferings");

            migrationBuilder.DropIndex(
                name: "IX_Classes_CourseModuleId",
                table: "Classes");

            migrationBuilder.DropColumn(
                name: "CourseModuleId",
                table: "Classes");
        }
    }
}
