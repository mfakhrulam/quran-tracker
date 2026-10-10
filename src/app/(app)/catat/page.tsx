import SessionForm from "@/components/SessionForm";
import { SURAHS } from "@/lib/mushaf/surahs";
import { todayISO } from "@/lib/tracker/date";

export default function CatatPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Catat setoran</h1>
      <SessionForm today={todayISO()} surahs={SURAHS.map((s) => ({ number: s.number, latin: s.latin }))} />
    </div>
  );
}
