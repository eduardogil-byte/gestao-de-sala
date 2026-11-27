using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace SalaGest.Api.Migrations
{
    /// <inheritdoc />
    public partial class ClassContinuity : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "ContinuityId",
                table: "Classes",
                type: "uniqueidentifier",
                nullable: false,
                defaultValueSql: "NEWID()");

            migrationBuilder.AddColumn<int>(
                name: "PreviousClassGroupId",
                table: "Classes",
                type: "int",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_Classes_ContinuityId_SemesterId",
                table: "Classes",
                columns: new[] { "ContinuityId", "SemesterId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_Classes_PreviousClassGroupId",
                table: "Classes",
                column: "PreviousClassGroupId");

            migrationBuilder.AddForeignKey(
                name: "FK_Classes_Classes_PreviousClassGroupId",
                table: "Classes",
                column: "PreviousClassGroupId",
                principalTable: "Classes",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_Classes_Classes_PreviousClassGroupId",
                table: "Classes");

            migrationBuilder.DropIndex(
                name: "IX_Classes_ContinuityId_SemesterId",
                table: "Classes");

            migrationBuilder.DropIndex(
                name: "IX_Classes_PreviousClassGroupId",
                table: "Classes");

            migrationBuilder.DropColumn(
                name: "ContinuityId",
                table: "Classes");

            migrationBuilder.DropColumn(
                name: "PreviousClassGroupId",
                table: "Classes");
        }
    }
}
