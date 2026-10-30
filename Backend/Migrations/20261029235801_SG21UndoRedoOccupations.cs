using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace SalaGest.Api.Migrations
{
    /// <inheritdoc />
    public partial class SG21UndoRedoOccupations : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<DateTime>(
                name: "FromEndsAt",
                table: "OccupationChanges",
                type: "datetime2",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "FromRoomId",
                table: "OccupationChanges",
                type: "int",
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "FromStartsAt",
                table: "OccupationChanges",
                type: "datetime2",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "ReferenceChangeId",
                table: "OccupationChanges",
                type: "int",
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "ToEndsAt",
                table: "OccupationChanges",
                type: "datetime2",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "ToRoomId",
                table: "OccupationChanges",
                type: "int",
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "ToStartsAt",
                table: "OccupationChanges",
                type: "datetime2",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "FromEndsAt",
                table: "OccupationChanges");

            migrationBuilder.DropColumn(
                name: "FromRoomId",
                table: "OccupationChanges");

            migrationBuilder.DropColumn(
                name: "FromStartsAt",
                table: "OccupationChanges");

            migrationBuilder.DropColumn(
                name: "ReferenceChangeId",
                table: "OccupationChanges");

            migrationBuilder.DropColumn(
                name: "ToEndsAt",
                table: "OccupationChanges");

            migrationBuilder.DropColumn(
                name: "ToRoomId",
                table: "OccupationChanges");

            migrationBuilder.DropColumn(
                name: "ToStartsAt",
                table: "OccupationChanges");
        }
    }
}
