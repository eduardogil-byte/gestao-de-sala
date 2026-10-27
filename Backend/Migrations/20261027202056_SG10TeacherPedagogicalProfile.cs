using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace SalaGest.Api.Migrations
{
    /// <inheritdoc />
    public partial class SG10TeacherPedagogicalProfile : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "Education",
                table: "AspNetUsers",
                type: "nvarchar(2000)",
                maxLength: 2000,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "ProfessionalKnowledge",
                table: "AspNetUsers",
                type: "nvarchar(2000)",
                maxLength: 2000,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "TechnicalSkills",
                table: "AspNetUsers",
                type: "nvarchar(2000)",
                maxLength: 2000,
                nullable: false,
                defaultValue: "");

            migrationBuilder.CreateTable(
                name: "TeacherCapabilityQualifications",
                columns: table => new
                {
                    TeacherId = table.Column<string>(type: "nvarchar(450)", nullable: false),
                    CurricularCapabilityId = table.Column<int>(type: "int", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_TeacherCapabilityQualifications", x => new { x.TeacherId, x.CurricularCapabilityId });
                    table.ForeignKey(
                        name: "FK_TeacherCapabilityQualifications_AspNetUsers_TeacherId",
                        column: x => x.TeacherId,
                        principalTable: "AspNetUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_TeacherCapabilityQualifications_CurricularCapabilities_CurricularCapabilityId",
                        column: x => x.CurricularCapabilityId,
                        principalTable: "CurricularCapabilities",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "TeacherCourseQualifications",
                columns: table => new
                {
                    TeacherId = table.Column<string>(type: "nvarchar(450)", nullable: false),
                    CourseId = table.Column<int>(type: "int", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_TeacherCourseQualifications", x => new { x.TeacherId, x.CourseId });
                    table.ForeignKey(
                        name: "FK_TeacherCourseQualifications_AspNetUsers_TeacherId",
                        column: x => x.TeacherId,
                        principalTable: "AspNetUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_TeacherCourseQualifications_Courses_CourseId",
                        column: x => x.CourseId,
                        principalTable: "Courses",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "TeacherUnitQualifications",
                columns: table => new
                {
                    TeacherId = table.Column<string>(type: "nvarchar(450)", nullable: false),
                    CurricularUnitId = table.Column<int>(type: "int", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_TeacherUnitQualifications", x => new { x.TeacherId, x.CurricularUnitId });
                    table.ForeignKey(
                        name: "FK_TeacherUnitQualifications_AspNetUsers_TeacherId",
                        column: x => x.TeacherId,
                        principalTable: "AspNetUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_TeacherUnitQualifications_CurricularUnits_CurricularUnitId",
                        column: x => x.CurricularUnitId,
                        principalTable: "CurricularUnits",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_TeacherCapabilityQualifications_CurricularCapabilityId",
                table: "TeacherCapabilityQualifications",
                column: "CurricularCapabilityId");

            migrationBuilder.CreateIndex(
                name: "IX_TeacherCourseQualifications_CourseId",
                table: "TeacherCourseQualifications",
                column: "CourseId");

            migrationBuilder.CreateIndex(
                name: "IX_TeacherUnitQualifications_CurricularUnitId",
                table: "TeacherUnitQualifications",
                column: "CurricularUnitId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "TeacherCapabilityQualifications");

            migrationBuilder.DropTable(
                name: "TeacherCourseQualifications");

            migrationBuilder.DropTable(
                name: "TeacherUnitQualifications");

            migrationBuilder.DropColumn(
                name: "Education",
                table: "AspNetUsers");

            migrationBuilder.DropColumn(
                name: "ProfessionalKnowledge",
                table: "AspNetUsers");

            migrationBuilder.DropColumn(
                name: "TechnicalSkills",
                table: "AspNetUsers");
        }
    }
}
