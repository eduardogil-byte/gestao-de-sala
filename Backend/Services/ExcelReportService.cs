using ClosedXML.Excel;
using Microsoft.EntityFrameworkCore;
using SalaGest.Api.Contracts;
using SalaGest.Api.Data;
using SalaGest.Api.Models;

namespace SalaGest.Api.Services;

public enum InstitutionalReport { Ambientes, Docentes, Catalogo, Ocupacoes, Planejamento, Indicadores, Comparacao }
public sealed record ReportFilters(int? SemesterId, int? SecondSemesterId, int? RoomId,
    DateOnly? From, DateOnly? To, string? Status, int? ShiftId = null);
public sealed record GeneratedReport(byte[] Content, string FileName);

public sealed class ExcelReportService(AppDbContext db, IConfiguration configuration)
{
    private const int MaxRows = 10000;

    public async Task<GeneratedReport> GenerateAsync(InstitutionalReport report, ReportFilters filters,
        CancellationToken cancellationToken)
    {
        using var workbook = new XLWorkbook();
        Information(workbook, report, filters);
        var created = report switch
        {
            InstitutionalReport.Ambientes => await Rooms(workbook, filters, cancellationToken),
            InstitutionalReport.Docentes => await Teachers(workbook, cancellationToken),
            InstitutionalReport.Catalogo => await Catalog(workbook, cancellationToken),
            InstitutionalReport.Ocupacoes => await Occupations(workbook, filters, cancellationToken),
            InstitutionalReport.Planejamento => await Planning(workbook, filters, cancellationToken),
            InstitutionalReport.Indicadores => await Indicators(workbook, filters, cancellationToken),
            InstitutionalReport.Comparacao => await Comparison(workbook, filters, cancellationToken),
            _ => throw new ReportRequestException("Relatório inválido.")
        };
        if (!created) throw new ReportEmptyException("Não há registros para os filtros selecionados.");
        foreach (var sheet in workbook.Worksheets) sheet.Columns().AdjustToContents(8, 50);
        using var stream = new MemoryStream();
        workbook.SaveAs(stream);
        var stamp = filters.SemesterId is int sem ? $"_semestre-{sem}" : "";
        var safeName = $"SalaGest_{report.ToString().ToLowerInvariant()}{stamp}.xlsx";
        return new GeneratedReport(stream.ToArray(), safeName);
    }

    private async Task<bool> Rooms(XLWorkbook book, ReportFilters filters, CancellationToken ct)
    {
        var query = db.Rooms.AsNoTracking().AsSplitQuery().AsQueryable();
        if (filters.RoomId is int roomId) query = query.Where(x => x.Id == roomId);
        var rooms = await query.Include(x => x.Resources).Include(x => x.ComputerGroups)
            .ThenInclude(x => x.Software).ThenInclude(x => x.Software).OrderBy(x => x.Name).Take(MaxRows + 1).ToListAsync(ct);
        Limit(rooms.Count);
        Limit(rooms.Sum(x => x.Resources.Count + x.ComputerGroups.Count + x.ComputerGroups.Sum(g => g.Software.Count)));
        var roomSheet = Sheet(book, "Ambientes", ["Código", "Nome", "Tipo", "Localização", "Capacidade física", "Ativo"]);
        foreach (var room in rooms) Row(roomSheet, [room.Code, room.Name, room.Kind.ToString(), room.Location, room.Seats, room.Active]);
        var resourceSheet = Sheet(book, "Recursos", ["Código do ambiente", "Ambiente", "Recurso", "Categoria", "Quantidade", "Operacionais", "Descrição", "Conservação", "Especificações", "Voltagem", "Garantia até", "Licença até"]);
        foreach (var r in rooms.SelectMany(x => x.Resources.Select(y => (Room: x, Resource: y))))
            Row(resourceSheet, [r.Room.Code, r.Room.Name, r.Resource.Name, r.Resource.Type, r.Resource.Quantity,
                r.Resource.OperationalQuantity, r.Resource.Description, r.Resource.Condition, r.Resource.TechnicalDetails,
                r.Resource.Voltage, r.Resource.WarrantyExpiresOn, r.Resource.LicenseExpiresOn]);
        var computerSheet = Sheet(book, "Computadores", ["Código do ambiente", "Ambiente", "Grupo", "Quantidade", "RAM (GB)", "Categoria", "GPU dedicada", "Processador", "Armazenamento", "Placa de vídeo", "Sistema operacional"]);
        foreach (var r in rooms.SelectMany(x => x.ComputerGroups.Select(y => (Room: x, Group: y))))
            Row(computerSheet, [r.Room.Code, r.Room.Name, r.Group.Description, r.Group.Quantity, r.Group.RamGb,
                r.Group.Tier.ToString(), r.Group.DedicatedGpu, r.Group.Processor, r.Group.Storage, r.Group.GraphicsCard, r.Group.OperatingSystem]);
        var softwareSheet = Sheet(book, "Softwares", ["Código do ambiente", "Ambiente", "Grupo", "Software", "Instalações", "Licenças", "Versão", "Licença até"]);
        foreach (var r in rooms.SelectMany(x => x.ComputerGroups.SelectMany(g => g.Software.Select(s => (Room: x, Group: g, Link: s)))))
            Row(softwareSheet, [r.Room.Code, r.Room.Name, r.Group.Description, r.Link.Software.Name,
                r.Link.InstalledQuantity, r.Link.LicenseQuantity, r.Link.Version, r.Link.LicenseExpiresOn]);
        return rooms.Count > 0;
    }

    private async Task<bool> Teachers(XLWorkbook book, CancellationToken ct)
    {
        var teachers = await db.Users.AsNoTracking().Where(u => db.UserRoles.Any(ur => ur.UserId == u.Id &&
                db.Roles.Any(role => role.Id == ur.RoleId && role.NormalizedName == "PROFESSOR")))
            .OrderBy(x => x.DisplayName).Take(MaxRows + 1).ToListAsync(ct);
        Limit(teachers.Count);
        var ids = teachers.Select(x => x.Id).ToArray();
        var courses = await db.TeacherCourseQualifications.AsNoTracking().Where(x => ids.Contains(x.TeacherId))
            .Select(x => new { x.TeacherId, x.Course.Code, x.Course.Name }).ToListAsync(ct);
        var units = await db.TeacherUnitQualifications.AsNoTracking().Where(x => ids.Contains(x.TeacherId))
            .Select(x => new { x.TeacherId, x.CurricularUnit.Code, Unit = x.CurricularUnit.Name,
                Course = x.CurricularUnit.CourseModule.Course.Code }).ToListAsync(ct);
        var caps = await db.TeacherCapabilityQualifications.AsNoTracking().Where(x => ids.Contains(x.TeacherId))
            .Select(x => new { x.TeacherId, x.CurricularCapability.Description, UC = x.CurricularCapability.CurricularUnit.Code,
                Course = x.CurricularCapability.CurricularUnit.CourseModule.Course.Code }).ToListAsync(ct);
        var sheet = Sheet(book, "Docentes", ["ID interno", "Nome", "Formação", "Habilidades", "Conhecimentos", "Cursos", "UCs", "Capacidades"]);
        foreach (var t in teachers)
            Row(sheet, [t.Id, t.DisplayName, t.Education, t.TechnicalSkills, t.ProfessionalKnowledge,
                string.Join(" | ", courses.Where(x => x.TeacherId == t.Id).Select(x => $"{x.Code} — {x.Name}")),
                string.Join(" | ", units.Where(x => x.TeacherId == t.Id).Select(x => $"{x.Course}/{x.Code} — {x.Unit}")),
                string.Join(" | ", caps.Where(x => x.TeacherId == t.Id).Select(x => $"{x.Course}/{x.UC}: {x.Description}"))]);
        return teachers.Count > 0;
    }

    private async Task<bool> Catalog(XLWorkbook book, CancellationToken ct)
    {
        var courses = await db.Courses.AsNoTracking().OrderBy(x => x.Code).Take(MaxRows + 1)
            .Select(x => new { x.Code, x.Name, x.Active }).ToListAsync(ct);
        Limit(courses.Count);
        var courseSheet = Sheet(book, "Cursos", ["Código", "Curso", "Ativo"]);
        foreach (var x in courses) Row(courseSheet, [x.Code, x.Name, x.Active]);
        var modules = await db.CourseModules.AsNoTracking().OrderBy(x => x.Course.Code).ThenBy(x => x.Order)
            .Take(MaxRows + 1).Select(x => new { Course = x.Course.Code, x.Order, x.Name }).ToListAsync(ct);
        Limit(modules.Count);
        var moduleSheet = Sheet(book, "Módulos", ["Código curso", "Ordem", "Módulo"]);
        foreach (var x in modules) Row(moduleSheet, [x.Course, x.Order, x.Name]);
        var units = await db.CurricularUnits.AsNoTracking().OrderBy(x => x.CourseModule.Course.Code)
            .ThenBy(x => x.CourseModule.Order).ThenBy(x => x.Code).Take(MaxRows + 1)
            .Select(x => new { Course = x.CourseModule.Course.Code, ModuleOrder = x.CourseModule.Order,
                Module = x.CourseModule.Name, x.Code, x.Name, x.PlannedHours }).ToListAsync(ct);
        Limit(units.Count);
        var unitSheet = Sheet(book, "UCs", ["Código curso", "Ordem módulo", "Módulo", "Código UC", "UC", "CH prevista"]);
        foreach (var x in units) Row(unitSheet, [x.Course, x.ModuleOrder, x.Module, x.Code, x.Name, x.PlannedHours]);
        var rows = await db.CurricularCapabilities.AsNoTracking()
            .OrderBy(x => x.CurricularUnit.CourseModule.Course.Code)
            .ThenBy(x => x.CurricularUnit.CourseModule.Order).ThenBy(x => x.CurricularUnit.Code).ThenBy(x => x.Order)
            .Select(x => new { Course = x.CurricularUnit.CourseModule.Course.Code,
                CourseName = x.CurricularUnit.CourseModule.Course.Name, Module = x.CurricularUnit.CourseModule.Name,
                ModuleOrder = x.CurricularUnit.CourseModule.Order, UnitCode = x.CurricularUnit.Code,
                Unit = x.CurricularUnit.Name, UnitHours = x.CurricularUnit.PlannedHours,
                Capability = x.Description, x.Contents, x.RequiredHours, CapabilityOrder = x.Order })
            .Take(MaxRows + 1).ToListAsync(ct);
        Limit(rows.Count);
        var sheet = Sheet(book, "Capacidades", ["Código curso", "Curso", "Ordem módulo", "Módulo", "Código UC", "UC", "CH prevista UC", "Ordem capacidade", "Capacidade", "Conteúdos", "CH capacidade"]);
        foreach (var x in rows) Row(sheet, [x.Course, x.CourseName, x.ModuleOrder, x.Module, x.UnitCode, x.Unit,
            x.UnitHours, x.CapabilityOrder, x.Capability, x.Contents, x.RequiredHours]);
        return courses.Count > 0 || modules.Count > 0 || units.Count > 0 || rows.Count > 0;
    }

    private async Task<bool> Occupations(XLWorkbook book, ReportFilters filters, CancellationToken ct)
    {
        if (filters.SemesterId is int semesterId)
        {
            var semester = await db.Semesters.AsNoTracking().FirstOrDefaultAsync(x => x.Id == semesterId, ct);
            if (semester is null) throw new ReportRequestException("Semestre não encontrado.");
            filters = filters with { From = semester.StartDate, To = semester.EndDate, SemesterId = null };
        }
        var (from, to) = DateRange(filters);
        var query = OccupancyIndicators.EffectiveOccupations(db).Where(x => x.StartsAt >= from && x.StartsAt < to);
        if (filters.RoomId is int roomId) query = query.Where(x => x.RoomId == roomId);
        var items = await query.Include(x => x.Room).OrderBy(x => x.StartsAt)
            .Take(MaxRows + 1).ToListAsync(ct);
        Limit(items.Count);
        var shifts = await db.Shifts.AsNoTracking().ToDictionaryAsync(x => x.Id, ct);
        if (filters.ShiftId is int shiftId)
        {
            if (!shifts.TryGetValue(shiftId, out var selectedShift))
                throw new ReportRequestException("Turno não encontrado.");
            items = items.Where(x => TimeOnly.FromDateTime(x.StartsAt) == selectedShift.StartsAt &&
                TimeOnly.FromDateTime(x.EndsAt) == selectedShift.EndsAt).ToList();
        }
        var loanIds = items.Select(x => x.Id).ToArray();
        var loans = await db.Loans.AsNoTracking().Where(x => loanIds.Contains(x.RoomOccupationId) && x.Status == LoanStatus.Aprovado)
            .Select(x => new { x.RoomOccupationId, x.Borrower.DisplayName }).ToListAsync(ct);
        var teacherIds = items.Where(x => x.TeacherId != null).Select(x => x.TeacherId!).Distinct().ToArray();
        var bookingIds = items.Where(x => x.BookingRequestId != null).Select(x => x.BookingRequestId!.Value).Distinct().ToArray();
        var weeklyIds = items.Where(x => x.WeeklyClassId != null).Select(x => x.WeeklyClassId!.Value).Distinct().ToArray();
        var bookings = await db.Bookings.AsNoTracking().Where(x => bookingIds.Contains(x.Id))
            .ToDictionaryAsync(x => x.Id, ct);
        var weekly = await db.WeeklyClasses.AsNoTracking().Where(x => weeklyIds.Contains(x.Id))
            .Select(x => new { x.Id, x.Assignment.TeacherId, x.Assignment.ClassGroupId, x.Assignment.CurricularUnitId })
            .ToDictionaryAsync(x => x.Id, ct);
        var resolvedTeacherIds = teacherIds.Concat(bookings.Values.Select(x => x.TeacherId))
            .Concat(weekly.Values.Select(x => x.TeacherId)).Distinct().ToArray();
        var teachers = await db.Users.AsNoTracking().Where(x => resolvedTeacherIds.Contains(x.Id))
            .ToDictionaryAsync(x => x.Id, x => x.DisplayName, ct);
        var classIds = items.Where(x => x.ClassGroupId != null).Select(x => x.ClassGroupId!.Value)
            .Concat(bookings.Values.Where(x => x.ClassGroupId != null).Select(x => x.ClassGroupId!.Value))
            .Concat(weekly.Values.Select(x => x.ClassGroupId)).Distinct().ToArray();
        var classes = await db.Classes.AsNoTracking().Where(x => classIds.Contains(x.Id))
            .Select(x => new { x.Id, x.Name, Course = x.Course == null ? null : x.Course.Name })
            .ToDictionaryAsync(x => x.Id, ct);
        var unitIds = bookings.Values.Where(x => x.CurricularUnitId != null).Select(x => x.CurricularUnitId!.Value)
            .Concat(weekly.Values.Where(x => x.CurricularUnitId != null).Select(x => x.CurricularUnitId!.Value)).Distinct().ToArray();
        var units = await db.CurricularUnits.AsNoTracking().Where(x => unitIds.Contains(x.Id))
            .ToDictionaryAsync(x => x.Id, x => x.Name, ct);
        var capIds = bookings.Values.Where(x => x.CurricularCapabilityId != null).Select(x => x.CurricularCapabilityId!.Value).Distinct().ToArray();
        var caps = await db.CurricularCapabilities.AsNoTracking().Where(x => capIds.Contains(x.Id))
            .ToDictionaryAsync(x => x.Id, x => x.Description, ct);
        var sheet = Sheet(book, "Ocupações", ["Data", "Dia", "Turno", "Início", "Fim", "Código ambiente", "Ambiente", "Professor", "Turma", "Curso", "UC", "Capacidade", "Tipo", "Situação"]);
        foreach (var x in items)
        {
            var date = DateOnly.FromDateTime(x.StartsAt);
            var matchingShifts = shifts.Values.Where(s => s.StartsAt <= TimeOnly.FromDateTime(x.StartsAt) && s.EndsAt >= TimeOnly.FromDateTime(x.EndsAt)).ToArray();
            var shift = matchingShifts.Length == 1 ? matchingShifts[0].Name : "Turno não identificado";
            bookings.TryGetValue(x.BookingRequestId ?? -1, out var booking);
            weekly.TryGetValue(x.WeeklyClassId ?? -1, out var weeklyClass);
            var teacherId = booking?.TeacherId ?? weeklyClass?.TeacherId ?? x.TeacherId;
            var classId = booking?.ClassGroupId ?? weeklyClass?.ClassGroupId ?? x.ClassGroupId;
            var unitId = booking?.CurricularUnitId ?? weeklyClass?.CurricularUnitId;
            var courseName = classId is int groupId && classes.TryGetValue(groupId, out var classInfo) ? classInfo.Course : null;
            Row(sheet, [date, DayName(date.DayOfWeek), shift,
                TimeOnly.FromDateTime(x.StartsAt), TimeOnly.FromDateTime(x.EndsAt), x.Room.Code, x.Room.Name,
                loans.FirstOrDefault(l => l.RoomOccupationId == x.Id)?.DisplayName ??
                    (teacherId is not null && teachers.TryGetValue(teacherId, out var teacherName) ? teacherName : null),
                classId is int id && classes.TryGetValue(id, out var classRow) ? classRow.Name : null,
                courseName, unitId is int curricularUnitId && units.TryGetValue(curricularUnitId, out var unitName) ? unitName : null,
                booking?.CurricularCapabilityId is int capabilityId && caps.TryGetValue(capabilityId, out var capability) ? capability : null,
                x.Kind.ToString(), x.DayStatus.ToString()]);
        }
        return items.Count > 0;
    }

    private async Task<bool> Planning(XLWorkbook book, ReportFilters filters, CancellationToken ct)
    {
        if (filters.SemesterId is not int semesterId) throw new ReportRequestException("Selecione um semestre.");
        var query = db.PlanProposals.AsNoTracking().Where(x => x.SemesterPlan.SemesterId == semesterId);
        if (filters.RoomId is int roomId) query = query.Where(x => x.RoomId == roomId);
        if (!string.IsNullOrWhiteSpace(filters.Status) && Enum.TryParse<PlanProposalStatus>(filters.Status, true, out var status))
            query = query.Where(x => x.Status == status);
        var rows = await query.OrderBy(x => x.StartDate).ThenBy(x => x.Id).Take(MaxRows + 1)
            .Select(x => new { Semester = x.SemesterPlan.Semester.Name,
                Teacher = x.Assignment.Teacher.DisplayName, Class = x.Assignment.ClassGroup.Name,
                Course = x.Assignment.ClassGroup.Course!.Name, UC = x.Assignment.CurricularUnit!.Name,
                Capability = x.CurricularCapability == null ? null : x.CurricularCapability.Description,
                Room = x.Room.Name, Shift = x.Shift.Name, x.StartDate, x.EndDate, x.Status,
                x.DecidedAtUtc, x.RejectionReason, x.SemesterPlan.Published })
            .ToListAsync(ct);
        Limit(rows.Count);
        var sheet = Sheet(book, "Planejamento", ["Semestre", "Professor", "Turma", "Curso", "UC", "Capacidade", "Ambiente proposto", "Turno", "Início", "Fim", "Estado da proposta", "Decidida em (UTC)", "Motivo rejeição", "Plano publicado"]);
        foreach (var x in rows) Row(sheet, [x.Semester, x.Teacher, x.Class, x.Course, x.UC, x.Capability,
            x.Room, x.Shift, x.StartDate, x.EndDate, x.Status.ToString(), x.DecidedAtUtc, x.RejectionReason, x.Published]);
        return rows.Count > 0;
    }

    private async Task<bool> Indicators(XLWorkbook book, ReportFilters filters, CancellationToken ct)
    {
        if (filters.SemesterId is not int semesterId) throw new ReportRequestException("Selecione um semestre.");
        var result = await OccupancyIndicators.ForSemester(db, semesterId, filters.RoomId, Thresholds());
        if (result is null) throw new ReportRequestException("Semestre não encontrado.");
        var sheet = Sheet(book, "Resumo", ["Semestre ID", "De", "Até", "Ambientes analisados", "Capacidade (h)", "Ocupadas físicas (h)", "Ocupadas na capacidade (h)", "Disponíveis (h)", "Utilização (%)", "Ambientes capacidade desconhecida", "Conflitos", "Classificação", "Avisos"]);
        Row(sheet, [result.SemesterId, result.From, result.To, result.Rooms.Count, result.CapacityHours,
            result.PhysicalOccupiedHours, result.OccupiedWithinCapacityHours, result.AvailableHours,
            result.OccupancyPercent, result.RoomsWithUnknownCapacity, result.ConflictPairs,
            result.Classification, string.Join("; ", result.Warnings)]);
        var rooms = Sheet(book, "Ambientes", ["Código", "Ambiente", "Tipo", "Capacidade (h)", "Ocupadas físicas (h)", "Ocupadas na capacidade (h)", "Disponíveis (h)", "Utilização (%)", "Dias ocupados", "Turnos ocupados", "Gargalo/oportunidade", "Conflitos", "Fora da capacidade (h)", "Avisos"]);
        var codes = await db.Rooms.AsNoTracking().Where(x => result.Rooms.Select(r => r.RoomId).Contains(x.Id))
            .ToDictionaryAsync(x => x.Id, x => x.Code, ct);
        foreach (var x in result.Rooms) Row(rooms, [codes.GetValueOrDefault(x.RoomId), x.RoomName, x.Kind.ToString(), x.CapacityHours,
            x.PhysicalOccupiedHours, x.OccupiedWithinCapacityHours, x.AvailableHours, x.OccupancyPercent,
            x.DaysWithOccupations, x.OccupiedSlots, x.Classification, x.ConflictPairs, x.OutsideCapacityHours,
            string.Join("; ", x.Warnings)]);
        FormatPercent(sheet, 9);
        FormatPercent(rooms, 8);
        return result.Rooms.Count > 0;
    }

    private async Task<bool> Comparison(XLWorkbook book, ReportFilters filters, CancellationToken ct)
    {
        if (filters.SemesterId is not int firstId || filters.SecondSemesterId is not int secondId || firstId == secondId)
            throw new ReportRequestException("Selecione dois semestres distintos.");
        var first = await OccupancyIndicators.ForSemester(db, firstId, filters.RoomId, Thresholds());
        var second = await OccupancyIndicators.ForSemester(db, secondId, filters.RoomId, Thresholds());
        if (first is null || second is null) throw new ReportRequestException("Semestre não encontrado.");
        var sheet = Sheet(book, "Comparação", ["Semestre ID", "De", "Até", "Ambientes", "Capacidade (h)", "Ocupadas (h)", "Disponíveis (h)", "Utilização (%)", "Classificação", "Ambientes capacidade desconhecida"]);
        foreach (var x in new[] { first, second }) Row(sheet, [x.SemesterId, x.From, x.To, x.Rooms.Count,
            x.CapacityHours, x.PhysicalOccupiedHours, x.AvailableHours, x.OccupancyPercent,
            x.Classification, x.RoomsWithUnknownCapacity]);
        var diff = first.OccupancyPercent is decimal a && second.OccupancyPercent is decimal b ? b - a : (decimal?)null;
        var summary = Sheet(book, "Variação", ["Variação em pontos percentuais", "Calculável"]);
        Row(summary, [diff, diff.HasValue ? "Sim" : "Não: denominador desconhecido"]);
        FormatPercent(sheet, 8);
        FormatPercent(summary, 1, "0.00\" p.p.\"");
        return first.Rooms.Count > 0 || second.Rooms.Count > 0;
    }

    private IndicatorThresholds Thresholds() => new(
        configuration.GetValue<decimal?>("OccupancyIndicators:BottleneckPercent") ?? 85m,
        configuration.GetValue<decimal?>("OccupancyIndicators:OpportunityPercent") ?? 40m);

    private static (DateTime From, DateTime To) DateRange(ReportFilters filters)
    {
        DateOnly from;
        DateOnly to;
        if (filters.From is not DateOnly start || filters.To is not DateOnly end || end < start || end.DayNumber - start.DayNumber > 370)
            throw new ReportRequestException("Informe um intervalo válido de até 370 dias.");
        from = start; to = end;
        return (from.ToDateTime(TimeOnly.MinValue), to.AddDays(1).ToDateTime(TimeOnly.MinValue));
    }

    private static IXLWorksheet Sheet(XLWorkbook workbook, string name, string[] headers)
    {
        var sheet = workbook.Worksheets.Add(name);
        sheet.Cell(1, 1).Value = "SalaGest · Relatório institucional";
        sheet.Cell(2, 1).Value = $"Gerado em {DateTimeOffset.UtcNow:yyyy-MM-dd HH:mm} UTC";
        for (var i = 0; i < headers.Length; i++) Text(sheet.Cell(4, i + 1), headers[i]);
        sheet.Range(4, 1, 4, headers.Length).Style.Font.Bold = true;
        sheet.Range(4, 1, 4, headers.Length).Style.Fill.BackgroundColor = XLColor.LightSteelBlue;
        sheet.SheetView.FreezeRows(4);
        sheet.Range(4, 1, 4, headers.Length).SetAutoFilter();
        return sheet;
    }

    private static void Information(XLWorkbook workbook, InstitutionalReport report, ReportFilters filters)
    {
        var sheet = workbook.Worksheets.Add("Informações");
        Row(sheet, ["Relatório", report.ToString()]);
        Row(sheet, ["Gerado em UTC", DateTime.UtcNow]);
        Row(sheet, ["Semestre", filters.SemesterId]);
        Row(sheet, ["Segundo semestre", filters.SecondSemesterId]);
        Row(sheet, ["Ambiente ID", filters.RoomId]);
        Row(sheet, ["Data inicial", filters.From]);
        Row(sheet, ["Data final", filters.To]);
        Row(sheet, ["Situação", filters.Status]);
        Row(sheet, ["Observação", "Valores ausentes representam informação desconhecida; propostas não publicadas não são ocupações efetivas."]);
        sheet.Columns().AdjustToContents(10, 80);
    }

    private static void Row(IXLWorksheet sheet, object?[] values)
    {
        var row = (sheet.LastRowUsed()?.RowNumber() ?? 0) + 1;
        for (var i = 0; i < values.Length; i++)
        {
            var cell = sheet.Cell(row, i + 1);
            switch (values[i])
            {
                case null: cell.Clear(); break;
                case decimal d: cell.Value = (double)d; break;
                case int n: cell.Value = n; break;
                case bool b: cell.Value = b; break;
                case DateOnly date: cell.Value = date.ToDateTime(TimeOnly.MinValue); cell.Style.DateFormat.Format = "dd/mm/yyyy"; break;
                case DateTime dateTime: cell.Value = dateTime; cell.Style.DateFormat.Format = "dd/mm/yyyy hh:mm"; break;
                case TimeOnly time: Text(cell, time.ToString("HH:mm")); break;
                default: Text(cell, Convert.ToString(values[i], System.Globalization.CultureInfo.InvariantCulture) ?? ""); break;
            }
        }
    }

    private static void Text(IXLCell cell, string value)
    {
        cell.Value = value;
    }

    private static void FormatPercent(IXLWorksheet sheet, int column, string format = "0.00\"%\"")
    {
        var last = sheet.LastRowUsed()?.RowNumber() ?? 4;
        if (last >= 5) sheet.Range(5, column, last, column).Style.NumberFormat.Format = format;
    }

    private static void Limit(int count)
    {
        if (count > MaxRows) throw new ReportRequestException("Relatório acima do limite de 10.000 linhas; refine os filtros.");
    }

    private static string DayName(DayOfWeek day) => day switch
    { DayOfWeek.Monday => "Segunda-feira", DayOfWeek.Tuesday => "Terça-feira", DayOfWeek.Wednesday => "Quarta-feira",
      DayOfWeek.Thursday => "Quinta-feira", DayOfWeek.Friday => "Sexta-feira", DayOfWeek.Saturday => "Sábado", _ => "Domingo" };
}

public sealed class ReportRequestException(string message) : Exception(message);
public sealed class ReportEmptyException(string message) : Exception(message);
