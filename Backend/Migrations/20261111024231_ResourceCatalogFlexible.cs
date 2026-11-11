using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace SalaGest.Api.Migrations
{
    /// <inheritdoc />
    public partial class ResourceCatalogFlexible : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "ResourceCatalogItemId",
                table: "RoomResources",
                type: "int",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "ResourceCatalogItemId",
                table: "CapabilityResourceRequirements",
                type: "int",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "ResourceCatalog",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    Name = table.Column<string>(type: "nvarchar(120)", maxLength: 120, nullable: false),
                    NormalizedName = table.Column<string>(type: "nvarchar(120)", maxLength: 120, nullable: false),
                    Category = table.Column<string>(type: "nvarchar(80)", maxLength: 80, nullable: false),
                    Description = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: true),
                    Active = table.Column<bool>(type: "bit", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ResourceCatalog", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_RoomResources_ResourceCatalogItemId",
                table: "RoomResources",
                column: "ResourceCatalogItemId");

            migrationBuilder.CreateIndex(
                name: "IX_CapabilityResourceRequirements_ResourceCatalogItemId",
                table: "CapabilityResourceRequirements",
                column: "ResourceCatalogItemId");

            migrationBuilder.CreateIndex(
                name: "IX_ResourceCatalog_NormalizedName",
                table: "ResourceCatalog",
                column: "NormalizedName",
                unique: true);

            // Importa apenas tipos já registrados. Registros com o mesmo nome em categorias
            // divergentes permanecem intactos e sem vínculo até revisão administrativa.
            migrationBuilder.Sql(@"
                ;WITH Sources AS (
                    SELECT Name, NormalizedName, Type AS Category, NormalizedType, 0 AS Priority FROM RoomResources
                    UNION ALL
                    SELECT Name, NormalizedName, Type AS Category, NormalizedType, 1 AS Priority FROM CapabilityResourceRequirements
                ), Ranked AS (
                    SELECT Name, NormalizedName, Category,
                        ROW_NUMBER() OVER (PARTITION BY NormalizedName ORDER BY Priority, Name, Category) AS Position
                    FROM Sources WHERE NormalizedName <> 'SALA ATIVA'
                )
                INSERT INTO ResourceCatalog (Name, NormalizedName, Category, Active)
                SELECT Name, NormalizedName, Category, 1 FROM Ranked WHERE Position = 1;

                UPDATE resource SET ResourceCatalogItemId = catalog.Id
                FROM RoomResources AS resource
                JOIN ResourceCatalog AS catalog ON catalog.NormalizedName = resource.NormalizedName
                    AND UPPER(LTRIM(RTRIM(catalog.Category))) = resource.NormalizedType;

                UPDATE requirement SET ResourceCatalogItemId = catalog.Id
                FROM CapabilityResourceRequirements AS requirement
                JOIN ResourceCatalog AS catalog ON catalog.NormalizedName = requirement.NormalizedName
                    AND UPPER(LTRIM(RTRIM(catalog.Category))) = requirement.NormalizedType;

            ");

            migrationBuilder.AddForeignKey(
                name: "FK_CapabilityResourceRequirements_ResourceCatalog_ResourceCatalogItemId",
                table: "CapabilityResourceRequirements",
                column: "ResourceCatalogItemId",
                principalTable: "ResourceCatalog",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "FK_RoomResources_ResourceCatalog_ResourceCatalogItemId",
                table: "RoomResources",
                column: "ResourceCatalogItemId",
                principalTable: "ResourceCatalog",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_CapabilityResourceRequirements_ResourceCatalog_ResourceCatalogItemId",
                table: "CapabilityResourceRequirements");

            migrationBuilder.DropForeignKey(
                name: "FK_RoomResources_ResourceCatalog_ResourceCatalogItemId",
                table: "RoomResources");

            migrationBuilder.DropTable(
                name: "ResourceCatalog");

            migrationBuilder.DropIndex(
                name: "IX_RoomResources_ResourceCatalogItemId",
                table: "RoomResources");

            migrationBuilder.DropIndex(
                name: "IX_CapabilityResourceRequirements_ResourceCatalogItemId",
                table: "CapabilityResourceRequirements");

            migrationBuilder.DropColumn(
                name: "ResourceCatalogItemId",
                table: "RoomResources");

            migrationBuilder.DropColumn(
                name: "ResourceCatalogItemId",
                table: "CapabilityResourceRequirements");
        }
    }
}
