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
          <li><b>Gantt</b> — ve výchozím stavu jen projekty, ať je vidět celkový přehled; subúkoly zobrazíš zaškrtnutím „zobrazit subúkoly“ nad grafem (číslo u projektu říká, kolik jich je skrytých). Bez data → sekce „Bez termínu“ (žádná umělá data). Tažením pruhu posuneš termín, tažením za okraj změníš začátek/konec (jen člen týmu a admin).</li>
          <li><b>Archiv</b> — místo mazání. Obnovit lze kdykoli; definitivní smazání jen admin.</li>
        </ul>
      </section>
      <section className="card p-5 space-y-2">
        <div className="text-base text-a-text font-semibold">Eventy a zakázky</div>
        <ul className="list-disc pl-5 space-y-1">
          <li><b>Eventy</b> (veletrhy, konference) a <b>Zakázky</b> (klientské dodávky) fungují úplně stejně — jen jsou ve dvou sekcích. Řadí se od nejbližšího termínu.</li>
          <li><b>Stavy</b>: Nezačato → Probíhá příprava → <b>Ready to go</b> (vše nachystáno, můžeme vyrazit) → Hotovo.</li>
          <li><b>Vychystávka</b> — Materiál, Vybavení a Check list jsou tři seznamy a zároveň odškrtávátka. Počítadlo „x/y nachystáno“ vidíš i ve výpisu, takže před odjezdem je hned jasné, co chybí.</li>
          <li><b>Finance</b> — hlavní náklad zvlášť (u eventu cena stánku, u zakázky fixní náklad jako lokace nebo povolení), ostatní náklady jako jednotlivé položky a k tomu fakturovaná částka; nástroj dopočítá celkové náklady a hrubý zisk.</li>
          <li><b>Dokumenty a fotky</b> — smlouvy a objednávky přetáhni přímo do akce (max 20 MB na soubor). Fotky se při nahrání automaticky zmenší. Na velké fotogalerie použij radši odkaz na Disk — úložiště appky je omezené.</li>
          <li><b>Kalendář</b> — eventy i zakázky v jednom měsíčním přehledu kvůli kapacitám. Vícedenní akce se táhne přes celý svůj rozsah, barva rozlišuje event od zakázky a tečka ukazuje stav. Klik do dne založí novou akci k tomu datu.</li>
          <li>Kdo je <b>event manažer</b> nebo v týmu, dostane upozornění při přiřazení a připomínku 7 dní před akcí.</li>
          <li><b>Pozvánka do kalendáře</b> — akce s vyplněným termínem rozešle manažerovi, týmu a (volitelně) kontaktům e-mail s pozvánkou. V Gmailu se ukáže s tlačítky Ano / Ne a po přijetí se akce zapíše do kalendáře. Změna termínu, místa nebo obsazení pozvánku všem automaticky přepíše, archivace nebo zrušení ji odvolá. Odesílá se s pár minut zpožděním, aby doladění akce nerozeslalo pět e-mailů za sebou. Odpovědi Přijmout / Odmítnout se v nástroji nesbírají — kdo jede, se dál drží polem Tým.</li>
        </ul>
      </section>
      <section className="card p-5 space-y-2">
        <div className="text-base text-a-text font-semibold">Chat</div>
        <ul className="list-disc pl-5 space-y-1">
          <li><b>Kanály a přímé zprávy</b> — veřejný kanál najde a přidá se k němu kdokoli z týmu, privátní vidí jen pozvaní. <b>#obecne</b> má každý automaticky. Přímé zprávy fungují i pro malou skupinu.</li>
          <li><b>Vlákna</b> — na zprávu se dá odpovědět stranou, ať se kanál nerozsype. Zaškrtnutím „Poslat i do kanálu“ se odpověď ukáže i v hlavním toku. Sledovaná vlákna máš v sekci Vlákna.</li>
          <li><b>Zmínky</b> — <b>@jméno</b> upozorní člověka, <b>@kanal</b> celý kanál (jen vlastník kanálu nebo admin). Všechny zmínky máš pohromadě v sekci Zmínky.</li>
          <li><b>Nepřečtené</b> — tučný kanál znamená nové zprávy, červené číslo počet zmínek. Počet vidíš i v titulku záložky. Filtrem v panelu si necháš jen nepřečtené, tlačítkem vedle označíš vše jako přečtené.</li>
          <li><b>Upozornění a dostupnost</b> — jak zapnout upozornění prohlížeče a nastavit stav najdeš v sekci níž.</li>
          <li><b>Hledání</b> — hledá se bez ohledu na diakritiku, filtry se dají psát rovnou do dotazu: <code>faktura v:#eventy od:@monika</code>.</li>
          <li><b>Práce se zprávou</b> — reakce, připnutí pro celý kanál, uložení jen pro sebe, připomínka na později, přeposlání jinam, citace do odpovědi a <b>založení subúkolu</b> rovnou z textu zprávy. Na mobilu menu otevřeš dlouhým stiskem.</li>
          <li><b>Přílohy, GIFy a ankety</b> — soubory přetáhni do okna (max 20 MB, fotky se zmenší), GIF vybereš z Giphy (ukládá se jen odkaz), anketa má jednu nebo víc možností a je vidět, kdo hlasoval.</li>
          <li><b>Naplánované odeslání</b> — šipka vedle tlačítka Odeslat. Zprávu jde do odeslání změnit nebo zrušit v sekci Naplánované.</li>
          <li><b>Kanál projektu nebo akce</b> — v detailu projektu / akce ho založíš jedním tlačítkem. Pak do něj chodí zprávy o změně stavu a o hotových nebo zablokovaných subúkolech.</li>
          <li><b>Souhrn e-mailem</b> — každý všední den odpoledne přijde přehled nepřečtených zmínek, přímých zpráv a vláken. Jde vypnout v Mojich notifikacích.</li>
        </ul>
      </section>
      <section className="card p-5 space-y-3">
        <div className="text-base text-a-text font-semibold">Upozornění a dostupnost</div>

        <div className="space-y-1">
          <div className="font-medium text-a-text">Zapnout upozornění v prohlížeči</div>
          <p>Bez nich se o nové zprávě dozvíš jen v otevřené appce. Zapnout je musí každý sám na svém počítači, appka se sama neptá.</p>
          <ol className="list-decimal pl-5 space-y-1">
            <li>Otevři <b>Moje notifikace</b> (v levém menu) nebo sjeď dolů v panelu chatu.</li>
            <li>Klikni na <b>Zapnout upozornění v prohlížeči</b>.</li>
            <li>Prohlížeč se zeptá — dej <b>Povolit</b>. Když jsi omylem dal Blokovat, povolí se to zpátky v nastavení webu (ikona zámku vedle adresy).</li>
          </ol>
          <p>Upozornění pak chodí na <b>zmínky, přímé zprávy a odpovědi ve vláknech</b>, a to i když máš appku na jiné záložce. Kliknutím se otevře rovnou daná zpráva. Zapnutí platí pro jeden prohlížeč a jedno zařízení — na notebooku i mobilu ho musíš zapnout zvlášť.</p>
          <p>Nezávisle na tom počet nepřečtených vidíš <b>v titulku záložky a v její ikoně</b>, takže stačí kouknout na lištu prohlížeče.</p>
        </div>

        <div className="space-y-1">
          <div className="font-medium text-a-text">Můj stav, Nerušit a tiché hodiny</div>
          <p>Nahoře vedle zvonečku je ikona tvého stavu (smajlík, tvoje emoji, nebo přeškrtnutý zvoneček při Nerušit). Po kliknutí nastavíš:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li><b>Stav</b> — hotové volby (Na akci, Na cestě, Oběd, Home office, Dovolená) nebo vlastní text. Emoji se ukáže vedle tvého jména u zpráv a v profilu, kolegové tak vidí, že jsi třeba u klienta. Hotové volby samy vyprší (třeba oběd za hodinu), vlastní stav zrušíš tlačítkem <b>Zrušit stav</b>.</li>
            <li><b>Nerušit</b> — na 30 minut, hodinu, tři hodiny nebo do zítřka.</li>
            <li><b>Tiché hodiny</b> — pravidelné okno (třeba 18:00–08:00), kdy chceš mít klid každý den.</li>
          </ul>
          <p>V režimu Nerušit a v tichých hodinách <b>nechodí e-maily z chatu ani upozornění prohlížeče</b>. V appce se nic neztratí — nepřečtené, zmínky i zvoneček fungují dál, jen tě nic nevyruší.</p>
          <p>Co komu chodí e-mailem a co jen do appky, si každý nastaví v <b>Mojich notifikacích</b>. Tam se vypíná i denní souhrn nepřečtených.</p>
        </div>
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
          <li><b>Přiřazené projekty</b> — vidí jen projekty, kde je vlastník, spolupracující, odpovědný za subúkol nebo přiřazený u contentu. Uvnitř nich má plná práva, nové projekty ale nezakládá. Odebráním poslední vazby přístup k projektu zaniká.</li>
          <li><b>Pouze čtení</b> — vidí vše, nemění nic. Pro externí: sdílený odkaz v Nastavení.</li>
          <li><b>Pozvánky</b> — admin v Uživatelích zadá e-mail, roli, oddělení a projekty; pozvanému přijde odkaz a po přihlášení Googlem je rovnou uvnitř s přidělenou rolí. Pozvánka platí 14 dní a uplatní se jen pro účet se <b>stejným e-mailem</b>. Odkaz sám o sobě přístup nedává.</li>
          <li>Nový uživatel bez pozvánky <b>nemá po přihlášení Googlem žádná práva</b>, dokud mu admin v Uživatelích nepřidělí roli (admin dostane upozornění).</li>
          <li><b>Moje notifikace</b> — každý si zvolí, které události chce a jestli v aplikaci nebo e-mailem.</li>
        </ul>
        <p className="text-xs text-a-text-4">Zkratka ⌘K / Ctrl+K otevře rychlé hledání.</p>
      </section>
    </div>
  );
}
