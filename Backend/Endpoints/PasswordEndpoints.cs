using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using System.Security.Claims;
using Microsoft.AspNetCore.Identity;
using SalaGest.Api.Contracts;
using SalaGest.Api.Models;

namespace Backend.Endpoints
{
    public static partial class ApiEndpoints
    {
        private static void MapPasswords(IEndpointRouteBuilder app)
        {
            app.MapPost("/api/auth/change-password", async (
            ChangePasswordRequest input,
            ClaimsPrincipal current,
            UserManager<AppUser> manager) =>
        {
            if (string.IsNullOrWhiteSpace(input.CurrentPassword) ||
                string.IsNullOrWhiteSpace(input.NewPassword))
            {
                return Error("Informe a senha atual e a nova senha.");
            }

            var user = await manager.FindByIdAsync(UserId(current));

            if (user is null)
                return Results.Unauthorized();

            var result = await manager.ChangePasswordAsync(
                user,
                input.CurrentPassword,
                input.NewPassword
            );

            if (!result.Succeeded)
            {
                var messages = result.Errors.Select(error =>
                    error.Code == "PasswordMismatch"
                        ? "A senha atual está incorreta."
                        : error.Description
                );

                return Error(string.Join("; ", messages));
            }

            return Results.Ok(new
            {
                message = "Senha alterada com sucesso."
            });
        })
        .RequireAuthorization()
        .WithTags("Autenticação");
        }
    }
}