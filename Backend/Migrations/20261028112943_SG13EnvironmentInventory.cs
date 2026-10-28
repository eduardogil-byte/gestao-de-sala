using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace SalaGest.Api.Migrations
{
    /// <inheritdoc />
    public partial class SG13EnvironmentInventory : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<DateOnly>(
                name: "LicenseExpiresOn",
                table: "GroupSoftware",
                type: "date",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "LicenseQuantity",
                table: "GroupSoftware",
                type: "int",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Version",
                table: "GroupSoftware",
                type: "nvarchar(80)",
                maxLength: 80,
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "CadCompatible",
                table: "ComputerGroups",
                type: "bit",
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "DockerWsl",
                table: "ComputerGroups",
                type: "bit",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "GraphicsCard",
                table: "ComputerGroups",
                type: "nvarchar(160)",
                maxLength: 160,
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "InternetAvailable",
                table: "ComputerGroups",
                type: "bit",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "NetworkDetails",
                table: "ComputerGroups",
                type: "nvarchar(500)",
                maxLength: 500,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "OperatingSystem",
                table: "ComputerGroups",
                type: "nvarchar(120)",
                maxLength: 120,
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "OperationalQuantity",
                table: "ComputerGroups",
                type: "int",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Processor",
                table: "ComputerGroups",
                type: "nvarchar(160)",
                maxLength: 160,
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "SimulatorCompatible",
                table: "ComputerGroups",
                type: "bit",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Storage",
                table: "ComputerGroups",
                type: "nvarchar(120)",
                maxLength: 120,
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "Virtualization",
                table: "ComputerGroups",
                type: "bit",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "RoomResources",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    RoomId = table.Column<int>(type: "int", nullable: false),
                    Name = table.Column<string>(type: "nvarchar(120)", maxLength: 120, nullable: false),
                    NormalizedName = table.Column<string>(type: "nvarchar(120)", maxLength: 120, nullable: false),
                    Type = table.Column<string>(type: "nvarchar(80)", maxLength: 80, nullable: false),
                    NormalizedType = table.Column<string>(type: "nvarchar(80)", maxLength: 80, nullable: false),
                    Quantity = table.Column<int>(type: "int", nullable: false),
                    OperationalQuantity = table.Column<int>(type: "int", nullable: true),
                    Description = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: true),
                    Condition = table.Column<string>(type: "nvarchar(80)", maxLength: 80, nullable: true),
                    TechnicalDetails = table.Column<string>(type: "nvarchar(2000)", maxLength: 2000, nullable: true),
                    Voltage = table.Column<int>(type: "int", nullable: true),
                    WarrantyExpiresOn = table.Column<DateOnly>(type: "date", nullable: true),
                    LicenseExpiresOn = table.Column<DateOnly>(type: "date", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_RoomResources", x => x.Id);
                    table.CheckConstraint("CK_RoomResources_OperationalQuantity", "[OperationalQuantity] IS NULL OR ([OperationalQuantity] >= 0 AND [OperationalQuantity] <= [Quantity])");
                    table.CheckConstraint("CK_RoomResources_Quantity", "[Quantity] >= 0");
                    table.CheckConstraint("CK_RoomResources_Voltage", "[Voltage] IS NULL OR [Voltage] BETWEEN 1 AND 1000");
                    table.ForeignKey(
                        name: "FK_RoomResources_Rooms_RoomId",
                        column: x => x.RoomId,
                        principalTable: "Rooms",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.AddCheckConstraint(
                name: "CK_GroupSoftware_Quantities",
                table: "GroupSoftware",
                sql: "[InstalledQuantity] >= 1 AND ([LicenseQuantity] IS NULL OR [LicenseQuantity] >= 1)");

            migrationBuilder.AddCheckConstraint(
                name: "CK_ComputerGroups_OperationalQuantity",
                table: "ComputerGroups",
                sql: "[OperationalQuantity] IS NULL OR ([OperationalQuantity] >= 0 AND [OperationalQuantity] <= [Quantity])");

            migrationBuilder.CreateIndex(
                name: "IX_RoomResources_RoomId_NormalizedName_NormalizedType",
                table: "RoomResources",
                columns: new[] { "RoomId", "NormalizedName", "NormalizedType" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "RoomResources");

            migrationBuilder.DropCheckConstraint(
                name: "CK_GroupSoftware_Quantities",
                table: "GroupSoftware");

            migrationBuilder.DropCheckConstraint(
                name: "CK_ComputerGroups_OperationalQuantity",
                table: "ComputerGroups");

            migrationBuilder.DropColumn(
                name: "LicenseExpiresOn",
                table: "GroupSoftware");

            migrationBuilder.DropColumn(
                name: "LicenseQuantity",
                table: "GroupSoftware");

            migrationBuilder.DropColumn(
                name: "Version",
                table: "GroupSoftware");

            migrationBuilder.DropColumn(
                name: "CadCompatible",
                table: "ComputerGroups");

            migrationBuilder.DropColumn(
                name: "DockerWsl",
                table: "ComputerGroups");

            migrationBuilder.DropColumn(
                name: "GraphicsCard",
                table: "ComputerGroups");

            migrationBuilder.DropColumn(
                name: "InternetAvailable",
                table: "ComputerGroups");

            migrationBuilder.DropColumn(
                name: "NetworkDetails",
                table: "ComputerGroups");

            migrationBuilder.DropColumn(
                name: "OperatingSystem",
                table: "ComputerGroups");

            migrationBuilder.DropColumn(
                name: "OperationalQuantity",
                table: "ComputerGroups");

            migrationBuilder.DropColumn(
                name: "Processor",
                table: "ComputerGroups");

            migrationBuilder.DropColumn(
                name: "SimulatorCompatible",
                table: "ComputerGroups");

            migrationBuilder.DropColumn(
                name: "Storage",
                table: "ComputerGroups");

            migrationBuilder.DropColumn(
                name: "Virtualization",
                table: "ComputerGroups");
        }
    }
}
