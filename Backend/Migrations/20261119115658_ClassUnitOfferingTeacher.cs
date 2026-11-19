using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace SalaGest.Api.Migrations
{
    /// <inheritdoc />
    public partial class ClassUnitOfferingTeacher : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "TeacherId",
                table: "ClassUnitOfferings",
                type: "nvarchar(450)",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_ClassUnitOfferings_TeacherId",
                table: "ClassUnitOfferings",
                column: "TeacherId");

            migrationBuilder.AddForeignKey(
                name: "FK_ClassUnitOfferings_AspNetUsers_TeacherId",
                table: "ClassUnitOfferings",
                column: "TeacherId",
                principalTable: "AspNetUsers",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_ClassUnitOfferings_AspNetUsers_TeacherId",
                table: "ClassUnitOfferings");

            migrationBuilder.DropIndex(
                name: "IX_ClassUnitOfferings_TeacherId",
                table: "ClassUnitOfferings");

            migrationBuilder.DropColumn(
                name: "TeacherId",
                table: "ClassUnitOfferings");
        }
    }
}
