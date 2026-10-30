export type Page =
  | "dashboard"
  | "agenda"
  | "room-timeline"
  | "opportunities"
  | "imports"
  | "exports"
  | "instructor-agenda"
  | "rooms"
  | "academic"
  | "pedagogical-catalog"
  | "teachers"
  | "schedules"
  | "semester-planning"
  | "bookings"
  | "loans"
  | "notifications";

export type NavigationItem = {
  page: Page;
  label: string;
  teacherLabel?: string;
  icon: "dashboard" | "calendar" | "door" | "spreadsheet" | "catalog" | "people" | "booking" | "loan" | "bell" | "course";
  adminOnly?: boolean;
};

export type NavigationSection = { title: string; items: NavigationItem[] };

const sections: NavigationSection[] = [
  {
    title: "Visão geral",
    items: [
      { page: "dashboard", label: "Visão geral", icon: "dashboard" },
      { page: "notifications", label: "Notificações", icon: "bell" },
    ],
  },
  {
    title: "Planejamento",
    items: [
      { page: "bookings", label: "Reservas", icon: "booking" },
      { page: "agenda", label: "Agenda", icon: "calendar" },
      { page: "room-timeline", label: "Cronograma de Ambientes", icon: "calendar" },
      { page: "instructor-agenda", label: "Agenda dos Instrutores", teacherLabel: "Minha Agenda", icon: "calendar" },
      { page: "semester-planning", label: "Planejamento Semestral", icon: "calendar" },
      { page: "schedules", label: "Grades semanais", icon: "calendar", adminOnly: true },
    ],
  },
  {
    title: "Pedagógico",
    items: [
      { page: "pedagogical-catalog", label: "Catálogo Pedagógico", icon: "catalog" },
      { page: "academic", label: "Turmas e disciplinas", icon: "course", adminOnly: true },
      { page: "teachers", label: "Professores", icon: "people" },
    ],
  },
  {
    title: "Ambientes",
    items: [
      { page: "rooms", label: "Ambientes", icon: "door" },
      { page: "opportunities", label: "Oportunidades de Ambientes", icon: "door", adminOnly: true },
    ],
  },
  {
    title: "Gestão",
    items: [
      { page: "imports", label: "Importar Dados", icon: "spreadsheet", adminOnly: true },
      { page: "exports", label: "Exportar Dados", icon: "spreadsheet", adminOnly: true },
    ],
  },
  {
    title: "Colaboração",
    items: [{ page: "loans", label: "Empréstimos", icon: "loan" }],
  },
];

export function getNavigationSections(isAdmin: boolean): NavigationSection[] {
  return sections
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => isAdmin || !item.adminOnly),
    }))
    .filter((section) => section.items.length > 0);
}
