import StepShell from "@/app/step-shell";

// 화면이 서버에서 외부 정보를 받아 오는 동안 보여 줄 껍데기.
//
// 각 화면의 loading.tsx 가 이걸 쓴다. 예전에는 loading.tsx 가 없어서, 버튼을
// 누르면 서버가 응답할 때까지 이전 화면이 그대로 있었다. 실측으로 비교 화면이
// 8~9초, 가시성 화면이 25초였다. 누른 사람 입장에서는 버튼이 안 눌린 것과
// 구별되지 않는다. 최소한 "지금 무엇을 하는 중"인지는 바로 보여야 한다.
export default function StepLoading({
  step,
  title,
  note,
}: {
  step: string;
  title: string;
  note: string;
}) {
  return (
    <StepShell step={step} title={title} description={note} backTo="/company">
      <div className="flex max-w-3xl flex-col gap-3" aria-live="polite">
        <p className="text-[13px] text-zinc-500">불러오는 중입니다…</p>

        {/* 값이 들어올 자리. 실제 수치가 아니므로 숫자를 두지 않는다. */}
        <div className="h-24 animate-pulse rounded-lg bg-zinc-100" />
        <div className="h-40 animate-pulse rounded-lg bg-zinc-100" />
      </div>
    </StepShell>
  );
}
