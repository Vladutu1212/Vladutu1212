# Widget Scriptable: linia 435 → Pasaj CFR Chitila, stația I.N.M.H

Widget pentru iOS ([Scriptable](https://apps.apple.com/app/scriptable/id1405459188)) care arată
când ajung următoarele autobuze 435 în stația **I.N.M.H**, pe sensul către **Pasaj CFR Chitila**.

Datele vin de la serverul folosit de aplicația Info TB (`info.stb.ro`). iOS nu lasă alte
aplicații să citească datele din Info TB, așa că scriptul întreabă direct serverul, la fel ca
aplicația. Nu ai nevoie de cont STB și nici de permisiuni speciale, doar de internet.

## Instalare

1. Instalează **Scriptable** din App Store.
2. În Scriptable apasă **+**, lipește conținutul fișierului
   [`autobuz-435-inmh.js`](autobuz-435-inmh.js) și denumește scriptul, de ex. `Autobuz 435`.
3. Rulează scriptul o dată din aplicație (▶︎) și alege **Previzualizare medie**, ca să verifici
   că apar sosirile.
4. Pe ecranul principal: ține apăsat → **Editează** → **+** → **Scriptable** → alege mărimea
   (mic sau mediu) → apasă pe widget → la **Script** alege `Autobuz 435`.
5. Opțional, pe ecranul de blocare: îl poți adăuga și ca widget dreptunghiular, rotund sau inline.

## Ce afișează

- timpul până la următorul autobuz (se actualizează singur, ca o numărătoare);
- ora sosirii și dacă e **● GPS** (poziție reală) sau **◷ program** (din orar);
- următoarele sosiri (până la 3);
- ora ultimei actualizări. Dacă nu e internet, afișează ultimele date salvate, marcate cu ⚠︎.

iOS decide cât de des reîmprospătează widgetul (de obicei la 5–15 minute). Apasă pe widget
pentru date proaspete.

## Probleme

- **„Nu am găsit stația…”**: rulează scriptul în aplicație → **Resetează**. Dacă tot nu merge,
  caută stația pe [info.stb.ro](https://info.stb.ro) și pune ID-ul ei în `CONFIG.stopId`,
  la începutul scriptului.
- **Altă linie, stație sau sens**: modifică `line`, `stopName` și `directionName` din `CONFIG`.

API-ul Info TB nu e public și oficial. Dacă STB îl schimbă, scriptul poate avea nevoie de
actualizare.
