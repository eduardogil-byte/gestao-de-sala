using System.Text.Json.Serialization;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Authentication.OpenIdConnect;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.OpenApi.Models;
using SalaGest.Api.Data;
using SalaGest.Api.Endpoints;
using SalaGest.Api.Models;
using SalaGest.Api.Services;

var builder = WebApplication.CreateBuilder(args);

var institutionalSso = builder.Configuration.GetSection("Authentication:InstitutionalSso")
    .Get<InstitutionalSsoOptions>() ?? new InstitutionalSsoOptions();
if (institutionalSso.Enabled) institutionalSso.Validate(builder.Environment.IsDevelopment());
builder.Services.Configure<InstitutionalSsoOptions>(
    builder.Configuration.GetSection("Authentication:InstitutionalSso"));
builder.Services.AddSingleton<InstitutionalLoginTickets>();

builder.Services.AddDbContext<AppDbContext>(options =>
    options.UseSqlServer(builder.Configuration.GetConnectionString("DefaultConnection")
        ?? throw new InvalidOperationException("ConnectionStrings:DefaultConnection não configurada"),
        sql => sql.UseCompatibilityLevel(120)));

var authentication = builder.Services.AddAuthentication(IdentityConstants.BearerScheme)
    .AddBearerToken(IdentityConstants.BearerScheme);
if (institutionalSso.Enabled)
{
    authentication.AddCookie(IdentityConstants.ExternalScheme, options =>
    {
        options.Cookie.Name = "SalaGest.External";
        options.Cookie.HttpOnly = true;
        options.Cookie.SecurePolicy = CookieSecurePolicy.Always;
        options.Cookie.SameSite = SameSiteMode.None;
        options.ExpireTimeSpan = TimeSpan.FromMinutes(5);
        options.SlidingExpiration = false;
    }).AddOpenIdConnect("InstitutionalOidc", options =>
    {
        options.Authority = institutionalSso.Authority;
        options.ClientId = institutionalSso.ClientId;
        options.ClientSecret = institutionalSso.ClientSecret;
        options.SignInScheme = IdentityConstants.ExternalScheme;
        options.CallbackPath = institutionalSso.CallbackPath;
        options.RequireHttpsMetadata = true;
        options.ResponseType = "code";
        options.UsePkce = true;
        options.SaveTokens = false;
        options.GetClaimsFromUserInfoEndpoint = false;
        options.MapInboundClaims = false;
        options.Scope.Clear();
        options.Scope.Add("openid");
        options.TokenValidationParameters.ValidateIssuer = true;
        options.TokenValidationParameters.ValidateAudience = true;
        options.TokenValidationParameters.ValidAudience = institutionalSso.ClientId;
        options.TokenValidationParameters.NameClaimType = "name";
        options.Events = new OpenIdConnectEvents
        {
            OnTokenValidated = context =>
            {
                var issuer = context.SecurityToken.Issuer;
                var subject = context.Principal?.FindFirst("sub")?.Value;
                if (string.IsNullOrWhiteSpace(issuer) || string.IsNullOrWhiteSpace(subject))
                {
                    context.Fail("A identidade institucional não contém issuer e subject válidos.");
                    return Task.CompletedTask;
                }
                if (context.Principal?.Identity is not System.Security.Claims.ClaimsIdentity identity)
                {
                    context.Fail("A identidade institucional não pôde ser validada.");
                    return Task.CompletedTask;
                }
                identity.AddClaim(new System.Security.Claims.Claim("salagest:validated-issuer", issuer));
                return Task.CompletedTask;
            },
            OnRemoteFailure = context =>
            {
                context.HandleResponse();
                context.Response.Redirect(Microsoft.AspNetCore.WebUtilities.QueryHelpers.AddQueryString(
                    institutionalSso.FrontendCallbackUrl!, "ssoError", "provider"));
                return Task.CompletedTask;
            },
        };
    });
}
builder.Services.AddIdentityCore<AppUser>(options =>
    {
        options.User.RequireUniqueEmail = true;
        options.Password.RequiredLength = 8;
        options.Password.RequireNonAlphanumeric = false;
        options.Password.RequireUppercase = false;
        options.Password.RequireLowercase = false;
        options.Password.RequireDigit = true;
        options.Lockout.DefaultLockoutTimeSpan = TimeSpan.FromMinutes(1);
        options.Lockout.MaxFailedAccessAttempts = 5;
    })
    .AddRoles<IdentityRole>()
    .AddEntityFrameworkStores<AppDbContext>()
    .AddSignInManager();
builder.Services.AddAuthorization(options =>
    options.AddPolicy("Admin", policy => policy.RequireRole("Admin")));
builder.Services.AddScoped<ScheduleGenerator>();
builder.Services.AddScoped<ExcelReportService>();

var origins = builder.Configuration.GetSection("Cors:FrontendOrigins").Get<string[]>()
    ?? new[] { "http://localhost:5173" };
builder.Services.AddCors(o => o.AddPolicy("React", policy =>
    policy.WithOrigins(origins).AllowAnyHeader().AllowAnyMethod()));
builder.Services.ConfigureHttpJsonOptions(o =>
{
    o.SerializerOptions.Converters.Add(new JsonStringEnumConverter());
    o.SerializerOptions.ReferenceHandler = System.Text.Json.Serialization.ReferenceHandler.IgnoreCycles;
});
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen(o =>
{
    o.SwaggerDoc("v1", new OpenApiInfo { Title = "SalaGest API", Version = "v1" });
    o.AddSecurityDefinition("Bearer", new OpenApiSecurityScheme
    {
        In = ParameterLocation.Header,
        Name = "Authorization",
        Type = SecuritySchemeType.Http,
        Scheme = "bearer",
        BearerFormat = "Identity Bearer Token",
        Description = "Cole apenas o accessToken retornado pelo endpoint de login"
    });
    o.AddSecurityRequirement(new OpenApiSecurityRequirement
    {
        { new OpenApiSecurityScheme { Reference = new OpenApiReference { Type = ReferenceType.SecurityScheme, Id = "Bearer" } }, Array.Empty<string>() }
    });
});

var app = builder.Build();
if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}
app.UseCors("React");
app.UseAuthentication();
app.UseAuthorization();
app.MapGet("/api/health", () => Results.Ok(new { status = "ok", service = "SalaGest" }));
app.MapSalaGestEndpoints();

// Execute as migrations antes de iniciar; o seed só cadastra turnos e o admin configurado.
await DbSeed.InitializeAsync(app.Services, app.Configuration);
app.Run();
