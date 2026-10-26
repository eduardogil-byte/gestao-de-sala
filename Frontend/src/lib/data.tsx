import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { read } from "./api";
import { resultMessage } from "./utils";
import type {
  Room,
  Software,
  Teacher,
  Semester,
  Shift,
  ClassGroup,
  Assignment,
  Schedule,
  Booking,
  Loan,
} from "../types";

export type Catalog = {
  rooms: Room[];
  software: Software[];
  teachers: Teacher[];
  semesters: Semester[];
  shifts: Shift[];
  classes: ClassGroup[];
  assignments: Assignment[];
  schedules: Schedule[];
  bookings: Booking[];
  loans: Loan[];
};
const blank: Catalog = {
  rooms: [],
  software: [],
  teachers: [],
  semesters: [],
  shifts: [],
  classes: [],
  assignments: [],
  schedules: [],
  bookings: [],
  loans: [],
};
const Ctx = createContext<{
  data: Catalog;
  reload: () => Promise<void>;
  loading: boolean;
  error: string;
}>({ data: blank, reload: async () => {}, loading: false, error: "" });
export function DataProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<Catalog>(blank);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const reload = useCallback(async () => {
    try {
      const [
        rooms,
        software,
        teachers,
        semesters,
        shifts,
        classes,
        assignments,
        schedules,
        bookings,
        loans,
      ] = await Promise.all([
        read<Room[]>("/rooms"),
        read<Software[]>("/software"),
        read<Teacher[]>("/teachers"),
        read<Semester[]>("/semesters"),
        read<Shift[]>("/shifts"),
        read<ClassGroup[]>("/classes"),
        read<Assignment[]>("/assignments"),
        read<Schedule[]>("/schedules"),
        read<Booking[]>("/bookings"),
        read<Loan[]>("/loans"),
      ]);
      setData({
        rooms,
        software,
        teachers,
        semesters,
        shifts,
        classes,
        assignments,
        schedules,
        bookings,
        loans,
      });
      setError("");
    } catch (e) {
      setError(resultMessage(e));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void reload();
  }, [reload]);
  return (
    <Ctx.Provider value={{ data, loading, reload, error }}>
      {children}
    </Ctx.Provider>
  );
}
export function useData() {
  return useContext(Ctx);
}
