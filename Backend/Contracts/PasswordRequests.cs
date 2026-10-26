namespace SalaGest.Api.Contracts;

public sealed record ChangePasswordRequest(
    string CurrentPassword,
    string NewPassword
);

public sealed record ResetTeacherPasswordRequest(
    string NewPassword
);
