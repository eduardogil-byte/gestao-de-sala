using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace SalaGest.Api.Migrations
{
    /// <inheritdoc />
    public partial class SG08CapabilitiesWorkload : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<decimal>(
                name: "PlannedHours",
                table: "CurricularUnits",
                type: "decimal(9,2)",
                precision: 9,
                scale: 2,
                nullable: true);

            migrationBuilder.CreateTable(
                name: "CurricularCapabilities",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    CurricularUnitId = table.Column<int>(type: "int", nullable: false),
                    Description = table.Column<string>(type: "nvarchar(300)", maxLength: 300, nullable: false),
                    NormalizedDescription = table.Column<string>(type: "nvarchar(300)", maxLength: 300, nullable: false),
                    Contents = table.Column<string>(type: "nvarchar(4000)", maxLength: 4000, nullable: false),
                    RequiredHours = table.Column<decimal>(type: "decimal(9,2)", precision: 9, scale: 2, nullable: false),
                    Order = table.Column<int>(type: "int", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_CurricularCapabilities", x => x.Id);
                    table.CheckConstraint("CK_CurricularCapabilities_Order", "[Order] > 0");
                    table.CheckConstraint("CK_CurricularCapabilities_RequiredHours", "[RequiredHours] > 0 AND [RequiredHours] <= 9999999.99");
                    table.ForeignKey(
                        name: "FK_CurricularCapabilities_CurricularUnits_CurricularUnitId",
                        column: x => x.CurricularUnitId,
                        principalTable: "CurricularUnits",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.AddCheckConstraint(
                name: "CK_CurricularUnits_PlannedHours",
                table: "CurricularUnits",
                sql: "[PlannedHours] IS NULL OR ([PlannedHours] > 0 AND [PlannedHours] <= 9999999.99)");

            migrationBuilder.CreateIndex(
                name: "IX_CurricularCapabilities_CurricularUnitId_NormalizedDescription",
                table: "CurricularCapabilities",
                columns: new[] { "CurricularUnitId", "NormalizedDescription" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_CurricularCapabilities_CurricularUnitId_Order",
                table: "CurricularCapabilities",
                columns: new[] { "CurricularUnitId", "Order" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "CurricularCapabilities");

            migrationBuilder.DropCheckConstraint(
                name: "CK_CurricularUnits_PlannedHours",
                table: "CurricularUnits");

            migrationBuilder.DropColumn(
                name: "PlannedHours",
                table: "CurricularUnits");
        }
    }
}
