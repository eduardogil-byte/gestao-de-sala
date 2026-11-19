using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace SalaGest.Api.Migrations
{
    /// <inheritdoc />
    public partial class CurricularUnitResources : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "CurricularUnitResourceRequirements",
                columns: table => new
                {
                    CurricularUnitId = table.Column<int>(type: "int", nullable: false),
                    ResourceCatalogItemId = table.Column<int>(type: "int", nullable: false),
                    Quantity = table.Column<int>(type: "int", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_CurricularUnitResourceRequirements", x => new { x.CurricularUnitId, x.ResourceCatalogItemId });
                    table.CheckConstraint("CK_CurricularUnitResourceRequirements_Quantity", "[Quantity] > 0 AND [Quantity] <= 100000");
                    table.ForeignKey(
                        name: "FK_CurricularUnitResourceRequirements_CurricularUnits_CurricularUnitId",
                        column: x => x.CurricularUnitId,
                        principalTable: "CurricularUnits",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_CurricularUnitResourceRequirements_ResourceCatalog_ResourceCatalogItemId",
                        column: x => x.ResourceCatalogItemId,
                        principalTable: "ResourceCatalog",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_CurricularUnitResourceRequirements_ResourceCatalogItemId",
                table: "CurricularUnitResourceRequirements",
                column: "ResourceCatalogItemId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "CurricularUnitResourceRequirements");
        }
    }
}
