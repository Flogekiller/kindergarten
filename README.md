# Kindergarten Mettmach

Statische Website für GitHub Pages mit Supabase-Anmeldung, Beiträgen und Fotos.

## Aktueller Stand

Der Adminbereich unter `admin.html` und die Beitragsansicht unter `index.html#aktuelles` sind implementiert. Die öffentlichen Projektwerte sind in `assets/config.js` eingetragen und die Verbindung wurde geprüft. Die Beitragstabelle, Zugriffsregeln und der Foto-Bucket sind im Projekt eingerichtet. Ohne Projektwerte wäre die Anmeldung ausdrücklich deaktiviert. Es gibt weder ein eingebautes Passwort noch eine vorgetäuschte Anmeldung. Die abschließende Erstellung und Berechtigung des Admin-Benutzers steht noch aus.

## Einmalige Einrichtung

1. Ein Supabase-Projekt unter https://supabase.com/dashboard erstellen (oder ein bestehendes, dafür vorgesehenes Projekt verwenden).
2. Im SQL Editor den gesamten Inhalt von `supabase/setup.sql` ausführen. Das legt die Beitragstabelle, Adminprüfung und den Foto-Bucket samt Zugriffsregeln an. Die Fotos sind öffentlich, genauso wie die veröffentlichten Beiträge.
3. Unter Authentication → Users → Add user → Create new user das Konto `test@test.at` mit einem selbst gewählten Passwort anlegen und **Auto Confirm User** aktivieren. Das gewünschte Passwort `test` ist zu kurz: Supabase erzwingt mindestens sechs Zeichen. Ein längeres Passwort direkt im Dashboard setzen; es gehört nicht in das Repository.
4. `supabase/grant-admin.sql` im SQL Editor ausführen. Damit erhält genau die UUID dieses bestätigten Kontos Adminrechte. Ein später mit derselben E-Mail-Adresse neu angelegtes Konto erhält diese Rechte nicht automatisch.
5. Unter Authentication die öffentliche Registrierung deaktivieren (Allow new users to sign up). Als Site URL `https://flogekiller.github.io/kindergarten/` einstellen. Email/Password-Anmeldung eingeschaltet lassen.
6. Die Projekt-URL und den **Publishable Key** (alternativ den alten **anon key**) in `assets/config.js` eintragen. Beide Werte sind für öffentliche Browseranwendungen bestimmt. **Keinen Secret Key oder service_role key eintragen.**
7. Änderungen nach `main` pushen. Nach dem GitHub-Pages-Build `https://flogekiller.github.io/kindergarten/admin.html` öffnen und anmelden.
8. Einen Beitrag mit und ohne Foto veröffentlichen und in einem zweiten, nicht angemeldeten Browser prüfen. Ein falsches Passwort muss abgewiesen werden. Ein angemeldetes Konto ohne Eintrag in der privaten Adminliste darf weder Beiträge noch Fotos schreiben.

Die Einrichtung der Supabase-Datenbank erfordert den Projektinhaber. Ein öffentlicher API-Key allein erlaubt weder das Anlegen von Adminbenutzern noch das Ausführen der Einrichtungsskripte.

## Bedienung

Im Footer der Website führt **Admin** zur Anmeldung. Nach der Anmeldung Titel und Text eingeben, optional bis zu fünf Fotos auswählen und **Beitrag veröffentlichen** wählen. Beiträge werden sofort öffentlich sichtbar, die neuesten zuerst. Je Foto sind maximal 5 MB als JPG, PNG oder WebP zulässig. Der Browser erzeugt verkleinerte WebP-Dateien ohne die ursprünglichen Kamerametadaten.

Bei einem Verbindungsfehler bleibt der Beitrag im geöffneten Formular erhalten. **Veröffentlichung erneut versuchen** verwendet dieselbe Beitrags-ID und bereits erfolgreich hochgeladene Bilder. Während eines solchen Wiederholungsversuchs bleibt der ursprüngliche Inhalt gesperrt. Entwürfe werden nicht dauerhaft gespeichert; beim Schließen oder Neuladen warnt der Browser vor dem Verlust ungespeicherter Eingaben. Die Anmeldung bleibt im aktuellen Browser-Tab gespeichert und wird über Supabase erneuert.

Beiträge können in dieser ersten Version erstellt werden. Bearbeiten und Löschen erfolgen bei Bedarf durch den Projektinhaber im Supabase-Dashboard. Wenn ein Upload oder ein Entwurf endgültig abgebrochen wird, können unreferenzierte Bilder im Bucket verbleiben; diese lassen sich dort entfernen. Verwendete Bildpfade stehen in `posts.photos`.

## Technische Prüfungen

Ohne Buildschritt auf GitHub Pages nutzbar. Die Supabase-Bibliothek ist lokal unter `assets/vendor` mit Version und MIT-Lizenz eingebunden.

- `node --test tests/posts.test.mjs`: Inhalts- und Dateivalidierung, öffentliche Schlüssel, sichere Bildpfade und idempotentes Wiederholen fehlgeschlagener Veröffentlichungen.
- `PGLITE_MODULE=/absoluter/pfad/zu/pglite/dist/index.js node --test tests/database.test.mjs`: Datenbankregeln gegen eine temporäre PostgreSQL-Laufzeit mit nachgebildeten Supabase-Rollen und Schemas. Die Datei führt keine Aktionen im echten Projekt aus.
- Die öffentliche Beitragsabfrage über die eingebundene Bibliothek wurde gegen das echte Projekt geprüft. Anonyme Schreibversuche und anonyme Aufrufe der Adminprüfung werden serverseitig abgewiesen. Ein authentifizierter Uploadtest steht bis zur Fertigstellung des Admin-Kontos noch aus.

## Quellen

- https://supabase.com/docs/guides/storage/security/access-control
- https://supabase.com/docs/guides/auth/users
- https://supabase.com/docs/guides/auth/password-security
- https://github.com/supabase/auth/blob/master/internal/conf/configuration.go
