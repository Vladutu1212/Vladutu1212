# Widgeturi Scriptable pentru autobuzul 435

Widgeturi pentru iOS ([Scriptable](https://apps.apple.com/app/scriptable/id1405459188)) care arată
când ajung următoarele autobuze 435 într-o stație:

| Script | Stația | Sensul |
|---|---|---|
| [`autobuz-435-inmh.js`](autobuz-435-inmh.js) | I.N.M.H | spre Pasaj CFR Chitila |
| [`autobuz-435-darmanesti.js`](autobuz-435-darmanesti.js) | Dărmănești | spre Complex Băneasa |

Scripturile sunt identice, diferă doar `CONFIG` de la început. Le poți folosi pe amândouă în
același timp, fiecare în widgetul lui.

Datele vin de la serverul folosit de aplicația Info TB (`info.stb.ro`). iOS nu lasă alte
aplicații să citească datele din Info TB, așa că scriptul întreabă direct serverul, la fel ca
aplicația. Nu ai nevoie de cont STB și nici de permisiuni speciale, doar de internet.

## Instalare

1. Instalează **Scriptable** din App Store.
2. În Scriptable apasă **+**, lipește conținutul unuia dintre scripturi și denumește-l,
   de ex. `Autobuz 435` sau `435 Darmanesti`.
3. Rulează scriptul o dată din aplicație (▶︎) și alege **Previzualizare medie**, ca să verifici
   că apar sosirile.
4. Pe ecranul principal: ține apăsat → **Editează** → **+** → **Scriptable** → alege mărimea
   (mic sau mediu) → apasă pe widget → la **Script** alege scriptul dorit.
5. Opțional, pe ecranul de blocare: îl poți adăuga și ca widget dreptunghiular, rotund sau inline.

## Ce afișează

- timpul până la următorul autobuz (se actualizează singur, ca o numărătoare);
- ora sosirii și dacă e **● GPS** (poziție reală) sau **◷ program** (din orar);
- următoarele sosiri (până la 3);
- ora ultimei actualizări. Dacă nu e internet, afișează ultimele date salvate, marcate cu ⚠︎.

iOS decide cât de des reîmprospătează widgetul (de obicei la 5–15 minute). Între actualizări,
numărătoarea continuă pe ecran pe baza ultimei estimări. Apăsarea pe widget deschide meniul
scriptului; „Previzualizare” arată acolo datele proaspete, dar widgetul de pe ecran se
actualizează doar când decide iOS.

## Probleme

- **„Nu am găsit stația…”**: rulează scriptul în aplicație → **Resetează**. Dacă tot nu merge,
  caută stația pe [info.stb.ro](https://info.stb.ro) și pune ID-ul ei în `CONFIG.stopId`,
  la începutul scriptului.
- **Altă linie, stație sau sens**: modifică `line`, `stopName` și `directionName` din `CONFIG`.

API-ul Info TB nu e public și oficial. Dacă STB îl schimbă, scriptul poate avea nevoie de
actualizare.

---

# Widget Scriptable pentru alarme

[`alarme.js`](alarme.js) arată alarmele **active** din aplicația Ceas, în widget mic, mediu sau
mare (și pe ecranul de blocare).

iOS nu lasă nicio aplicație, nici Scriptable, să citească direct alarmele din Ceas. Doar
aplicația **Scurtături** le poate citi, așa că o scurtătură le trimite scriptului, care le
salvează. Widgetul arată ultimele alarme primite. O automatizare rulează scurtătura singură
de fiecare dată când închizi Ceasul, ca widgetul să fie mereu la zi.

## 1. Scriptul

1. În Scriptable apasă **+**, lipește conținutul lui `alarme.js` și denumește-l **`Alarme`**.

## 2. Scurtătura „Sincronizare Alarme”

În Scurtături → **+**, denumește-o exact `Sincronizare Alarme` și adaugă acțiunile:

1. **Obține toate alarmele** (Get All Alarms), din categoria Ceas.
2. **Repetă cu fiecare** (Repeat with Each) pentru *Alarme*.
3. În interiorul repetării, o acțiune **Text** cu conținutul de mai jos. Fiecare câmp e
   *Element repetat* (Repeat Item) cu proprietatea indicată (atinge variabila → alege
   proprietatea):

   ```
   [Ora]|[Etichetă]|[Repetare]|[Este activată]
   ```

   - `Ora` (Time): atinge-o → **Format dată: Personalizat** → `HH:mm`;
   - `Etichetă` (Label), `Repetare` (Repeat), `Este activată` (Is Enabled);
   - între câmpuri pune caracterul `|`, fără spații.
4. După **Sfârșit repetare**: **Combină textul** (Combine Text) din *Rezultatele repetării*,
   cu separator **Personalizat**: `##`.
5. **Text**: `SYNC##` urmat de variabila *Text combinat*.
6. **Run Script** (Scriptable) → Script: `Alarme`, Parameter: *Text* de la pasul 5.
   **Run In App** și **Show When Run** dezactivate.

Rulează scurtătura o dată. Trebuie să răspundă „N alarme active salvate”.

Dacă vreo proprietate nu există sau are alt nume la tine, poți lăsa câmpul gol; doar ora e
obligatorie. Fără `Este activată` apar toate alarmele, inclusiv cele oprite. Fără `Repetare`,
fiecare alarmă e tratată ca zilnică.

## 3. Automatizări (recomandat)

În Scurtături → **Automatizare** → **+**:

- **Aplicație** → Ceas → **Este închisă** → *Rulează imediat* → `Sincronizare Alarme`.
  Așa, orice modificare făcută în Ceas ajunge în widget.
- Opțional: **Alarmă** → **Este oprită** (orice alarmă) → *Rulează imediat* →
  `Sincronizare Alarme`, ca alarmele de o singură dată să dispară după ce sună.

## 4. Widgetul

Pe ecranul principal: ține apăsat → **Editează** → **+** → **Scriptable** → mărimea dorită →
apasă pe widget → **Script**: `Alarme`.

- **Mic**: următoarea alarmă (ora, eticheta, numărătoarea inversă) și orele următoare.
- **Mediu**: următoarea alarmă mare și încă 3 alarme cu timpul rămas.
- **Mare**: următoarea alarmă și încă 4 cu zilele de repetare și timpul rămas, plus ora
  ultimei sincronizări.
- **Ecranul de blocare**: dreptunghiular, rotund sau inline.

Alarmele sunt ordonate după când sună următoarea dată (ține cont de zilele de repetare).
Apăsarea pe widget rulează scurtătura. Dacă datele au mai mult de 24 h, apare ⚠︎.
iOS decide când reîmprospătează widgetul, așa că o modificare poate apărea cu câteva minute
întârziere. Numărătoarea până la următoarea alarmă e mereu corectă.
