export default function HelpPage() {
  return (
    <div className="max-w-3xl space-y-6 text-sm text-a-text-2">
      <h1 className="text-2xl">Nápověda</h1>
      <section className="card p-5 space-y-2">
        <div className="text-base text-a-text font-semibold">Jak s nástrojem pracovat</div>
        <ul className="list-disc pl-5 space-y-1">
          <li><b>Dashboard</b> — co hoří: po termínu, do 7 dní, blokované, bez vlastníka, bez deadlinu, moje úkoly. Vše je proklikávací.</li>
          <li><b>Portfolio</b> — tabulka všech projektů. Stav a prioritu měníš přímo v řádku. Filtry nahoře, fulltext, export CSV.</li>
          <li><b>Detail projektu</b> — subúkoly upravuješ přímo v tabulce (stav, odpovědný, priorita, začátek, deadline). Kliknutím na řádek se otevře boční panel se vším ostatním (popis, definice hotovo, TODO list s termíny, závislost, odkazy, poznámka). Řádky lze přetahovat.</li>
          <li><b>Gantt</b> — projekt = hlavní řádek, subúkoly po rozkliknutí. Bez data → sekce „Bez termínu“ (žádná umělá data). Tažením pruhu posuneš termín, tažením za okraj změníš začátek/konec (jen člen týmu a admin).</li>
          <li><b>Archiv</b> — místo mazání. Obnovit lze kdykoli; definitivní smazání jen admin.</li>
        </ul>
      </section>
      <section className="card p-5 space-y-2">
        <div className="text-base text-a-text font-semibold">Pravidla, která nástroj hlídá</div>
        <ul className="list-disc pl-5 space-y-1">
          <li>Progress = hotové / (všechny − Cancelled). Bez subúkolů → „Bez subúkolů“, nikdy ne 100 %.</li>
          <li>Hotové všechny subúkoly projekt <b>neuzavřou</b> — nástroj jen nabídne Finished.</li>
          <li>Blocked vždy vyžaduje důvod.</li>
          <li>Termíny: <span className="text-dl-overdue font-semibold">po termínu</span>, <span className="text-dl-soon font-medium">do 7 dní</span>, hotovo zeleně, chybějící deadline je viditelně označen. Long-term štítek nahrazuje deadline projektu.</li>
          <li>Řazení: TOP → Middle → Low, uvnitř podle nejbližšího deadlinu.</li>
          <li>Změna termínu členem týmu → notifikace (a e-mail) adminům.</li>
        </ul>
      </section>
      <section className="card p-5 space-y-2">
        <div className="text-base text-a-text font-semibold">Role</div>
        <ul className="list-disc pl-5 space-y-1">
          <li><b>Admin</b> — správa uživatelů, nastavení, definitivní mazání, vše ostatní.</li>
          <li><b>Člen týmu</b> — zakládá a edituje projekty i subúkoly, mění stavy.</li>
          <li><b>Pouze čtení</b> — vidí vše, nemění nic. Pro externí: sdílený odkaz v Nastavení.</li>
          <li>Nový uživatel po přihlášení Googlem <b>nemá žádná práva</b>, dokud mu admin v Uživatelích nepřidělí roli (admin dostane upozornění).</li>
          <li><b>Moje notifikace</b> — každý si zvolí, které události chce a jestli v aplikaci nebo e-mailem.</li>
        </ul>
        <p className="text-xs text-a-text-4">Zkratka ⌘K / Ctrl+K otevře rychlé hledání.</p>
      </section>
    </div>
  );
}
