using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace SalaGest.Api.Migrations
{
    /// <inheritdoc />
    public partial class SG14EnvironmentCompatibility : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "CapabilityEnvironmentRequirements",
                columns: table => new
                {
                    CurricularCapabilityId = table.Column<int>(type: "int", nullable: false),
                    RoomKind = table.Column<int>(type: "int", nullable: true),
                    RequiresProjector = table.Column<bool>(type: "bit", nullable: false),
                    RequiredComputers = table.Column<int>(type: "int", nullable: true),
                    MinRamGb = table.Column<int>(type: "int", nullable: true),
                    ComputersCritical = table.Column<bool>(type: "bit", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_CapabilityEnvironmentRequirements", x => x.CurricularCapabilityId);
                    table.CheckConstraint("CK_CapabilityEnvironmentRequirements_Computers", "([RequiredComputers] IS NULL OR [RequiredComputers] > 0) AND ([MinRamGb] IS NULL OR [MinRamGb] > 0)");
                    table.ForeignKey(
                        name: "FK_CapabilityEnvironmentRequirements_CurricularCapabilities_CurricularCapabilityId",
                        column: x => x.CurricularCapabilityId,
                        principalTable: "CurricularCapabilities",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "CapabilityResourceRequirements",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    CurricularCapabilityId = table.Column<int>(type: "int", nullable: false),
                    Name = table.Column<string>(type: "nvarchar(120)", maxLength: 120, nullable: false),
                    Type = table.Column<string>(type: "nvarchar(80)", maxLength: 80, nullable: false),
                    NormalizedName = table.Column<string>(type: "nvarchar(120)", maxLength: 120, nullable: false),
                    NormalizedType = table.Column<string>(type: "nvarchar(80)", maxLength: 80, nullable: false),
                    Quantity = table.Column<int>(type: "int", nullable: false),
                    Critical = table.Column<bool>(type: "bit", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_CapabilityResourceRequirements", x => x.Id);
                    table.CheckConstraint("CK_CapabilityResourceRequirements_Quantity", "[Quantity] > 0");
                    table.ForeignKey(
                        name: "FK_CapabilityResourceRequirements_CapabilityEnvironmentRequirements_CurricularCapabilityId",
                        column: x => x.CurricularCapabilityId,
                        principalTable: "CapabilityEnvironmentRequirements",
                        principalColumn: "CurricularCapabilityId",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "CapabilitySoftwareRequirements",
                columns: table => new
                {
                    CurricularCapabilityId = table.Column<int>(type: "int", nullable: false),
                    SoftwareId = table.Column<int>(type: "int", nullable: false),
                    RequiredLicenses = table.Column<int>(type: "int", nullable: true),
                    Critical = table.Column<bool>(type: "bit", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_CapabilitySoftwareRequirements", x => new { x.CurricularCapabilityId, x.SoftwareId });
                    table.CheckConstraint("CK_CapabilitySoftwareRequirements_Licenses", "[RequiredLicenses] IS NULL OR [RequiredLicenses] > 0");
                    table.ForeignKey(
                        name: "FK_CapabilitySoftwareRequirements_CapabilityEnvironmentRequirements_CurricularCapabilityId",
                        column: x => x.CurricularCapabilityId,
                        principalTable: "CapabilityEnvironmentRequirements",
                        principalColumn: "CurricularCapabilityId",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_CapabilitySoftwareRequirements_SoftwareCatalog_SoftwareId",
                        column: x => x.SoftwareId,
                        principalTable: "SoftwareCatalog",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_CapabilityResourceRequirements_CurricularCapabilityId_NormalizedName_NormalizedType",
                table: "CapabilityResourceRequirements",
                columns: new[] { "CurricularCapabilityId", "NormalizedName", "NormalizedType" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_CapabilitySoftwareRequirements_SoftwareId",
                table: "CapabilitySoftwareRequirements",
                column: "SoftwareId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "CapabilityResourceRequirements");

            migrationBuilder.DropTable(
                name: "CapabilitySoftwareRequirements");

            migrationBuilder.DropTable(
                name: "CapabilityEnvironmentRequirements");
        }
    }
}
