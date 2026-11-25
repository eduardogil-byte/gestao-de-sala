using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace SalaGest.Api.Migrations
{
    /// <inheritdoc />
    public partial class InstitutionalShiftAndBookingRevision : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "ShiftId",
                table: "Classes",
                type: "int",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "Revision",
                table: "Bookings",
                type: "uniqueidentifier",
                nullable: false,
                defaultValue: new Guid("00000000-0000-0000-0000-000000000000"));

            migrationBuilder.AddColumn<bool>(
                name: "TurnExceptionConfirmed",
                table: "Bookings",
                type: "bit",
                nullable: false,
                defaultValue: false);

            migrationBuilder.CreateIndex(
                name: "IX_Classes_ShiftId",
                table: "Classes",
                column: "ShiftId");

            migrationBuilder.AddForeignKey(
                name: "FK_Classes_Shifts_ShiftId",
                table: "Classes",
                column: "ShiftId",
                principalTable: "Shifts",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_Classes_Shifts_ShiftId",
                table: "Classes");

            migrationBuilder.DropIndex(
                name: "IX_Classes_ShiftId",
                table: "Classes");

            migrationBuilder.DropColumn(
                name: "ShiftId",
                table: "Classes");

            migrationBuilder.DropColumn(
                name: "Revision",
                table: "Bookings");

            migrationBuilder.DropColumn(
                name: "TurnExceptionConfirmed",
                table: "Bookings");
        }
    }
}
