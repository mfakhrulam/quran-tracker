import { getDb } from "@/lib/auth/db";
import { loadSettings } from "@/lib/settings";
import { buildDailyPlan } from "@/lib/tracker/daily";
import { summarizeProgress } from "@/lib/tracker/progress";
import { getCachedStatuses } from "@/lib/tracker/progress-cache";
import { PAGE_LITES } from "@/lib/mushaf/pages";
import { todayISO } from "@/lib/tracker/date";
import SettingsForm from "@/components/SettingsForm";

export default async function PengaturanPage() {
  const today = todayISO();
  const [statuses, settings] = await Promise.all([getCachedStatuses(), loadSettings(getDb())]);
  const progress = summarizeProgress(PAGE_LITES, statuses);

  // Log hari ini sengaja tidak diambil: halaman ini hanya butuh jumlah halaman
  // per jalur untuk pratinjau cakupan, dan `manzilTotal` tidak bergantung log.
  const plan = buildDailyPlan({ statuses, logs: [], settings }, today);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-[26px] font-extrabold tracking-tight text-ink sm:text-[30px]">
          Pengaturan
        </h1>
        <p className="mt-1 text-sm text-ink-soft">
          Ritme murajaah menyesuaikan kondisi. Ubah angkanya kapan saja.
        </p>
      </div>

      <SettingsForm
        settings={settings}
        manzilTotal={plan.manzilTotal}
        memorizedPages={progress.memorizedPages}
      />
    </div>
  );
}
