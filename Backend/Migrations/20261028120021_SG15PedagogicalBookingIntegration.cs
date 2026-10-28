using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace SalaGest.Api.Migrations
{
    /// <inheritdoc />
    public partial class SG15PedagogicalBookingIntegration : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "CurricularCapabilityId",
                table: "Bookings",
                type: "int",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "CurricularUnitId",
                table: "Bookings",
                type: "int",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_Bookings_CurricularCapabilityId",
                table: "Bookings",
                column: "CurricularCapabilityId");

            migrationBuilder.CreateIndex(
                name: "IX_Bookings_CurricularUnitId",
                table: "Bookings",
                column: "CurricularUnitId");

            migrationBuilder.AddForeignKey(
                name: "FK_Bookings_CurricularCapabilities_CurricularCapabilityId",
                table: "Bookings",
                column: "CurricularCapabilityId",
                principalTable: "CurricularCapabilities",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "FK_Bookings_CurricularUnits_CurricularUnitId",
                table: "Bookings",
                column: "CurricularUnitId",
                principalTable: "CurricularUnits",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_Bookings_CurricularCapabilities_CurricularCapabilityId",
                table: "Bookings");

            migrationBuilder.DropForeignKey(
                name: "FK_Bookings_CurricularUnits_CurricularUnitId",
                table: "Bookings");

            migrationBuilder.DropIndex(
                name: "IX_Bookings_CurricularCapabilityId",
                table: "Bookings");

            migrationBuilder.DropIndex(
                name: "IX_Bookings_CurricularUnitId",
                table: "Bookings");

            migrationBuilder.DropColumn(
                name: "CurricularCapabilityId",
                table: "Bookings");

            migrationBuilder.DropColumn(
                name: "CurricularUnitId",
                table: "Bookings");
        }
    }
}
