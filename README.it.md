<p align="center">
  <img src="./astraeaworkspace1.png" alt="Astraea Workspace" width="680"/>
</p>

<p align="center">
  <a href="./README.md">English</a> ·
  <a href="./README.de.md">Deutsch</a> ·
  <b>Italiano</b> ·
  <a href="./README.es.md">Español</a> ·
  <a href="./README.fr.md">Français</a> ·
  <a href="./README.ru.md">Русский</a>
</p>

<p align="center">
  <strong>Uno spazio di lavoro sovrano e locale, progettato per la proprietà assoluta dei dati.</strong><br>
  <em>Local-first · Zero telemetria del prodotto per progettazione · Contenitori crittografati autenticati · Sicurezza predisposta per il post-quantum · Open Core</em>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Status-Public%20Beta%20Pre--Release-FFB300?style=for-the-badge" alt="Public Beta Pre-Release"/>
  <img src="https://img.shields.io/badge/Core%20Milestone-3334%2F3334-00C853?style=for-the-badge&logo=checkmarx&logoColor=white" alt="Core traguardo 3334/3334"/>
  <img src="https://img.shields.io/badge/Core-Rust%202021-DEA584?style=for-the-badge&logo=rust&logoColor=white" alt="Rust Core"/>
  <img src="https://img.shields.io/badge/Shell-Tauri%20v2-24C8D8?style=for-the-badge&logo=tauri&logoColor=white" alt="Tauri v2"/>
  <img src="https://img.shields.io/badge/UI-React%2019%20%7C%20TypeScript-61DAFB?style=for-the-badge&logo=react&logoColor=black" alt="React e TypeScript"/>
  <img src="https://img.shields.io/badge/Licenza-AGPLv3-00B0FF?style=for-the-badge" alt="AGPLv3"/>
</p>

---

> [!IMPORTANT]
> ## Stato del rilascio pubblico
>
> **Astraea Workspace è nella fase finale di blindatura pre-rilascio.**
>
> Il traguardo di implementazione del core è completo. L'attuale ciclo di rilascio è focalizzato su separazione delle edizioni, verifica end-to-end dei flussi di lavoro, Workspace Explorer, coerenza del design, accessibilità, localizzazione, prove di sicurezza (evidence), pacchettizzazione e test di regressione finali.
>
> I pacchetti di rilascio ufficiali saranno pubblicati solo dopo il superamento dei gate di rilascio. Fino ad allora, un traguardo di checklist non deve essere confuso con un rilascio pubblico distribuito e verificato.

---

## Cos'è Astraea Workspace?

Astraea Workspace è una suite di produttività desktop concepita attorno a un principio semplice:

**Il tuo lavoro deve rimanere utilizzabile, comprensibile e sotto il tuo pieno controllo anche quando non è disponibile alcun servizio cloud.**

Combina elaborazione documenti, gestione della conoscenza, strumenti creativi, automazione, ricerca locale, archiviazione crittografata e oggetti workspace trasversali all'interno di un unico ambiente desktop.

I flussi di lavoro principali sono **local-first**. Le funzionalità di rete sono capacità esplicite e non un prerequisito per aprire o modificare i tuoi documenti.

Astraea non è una semplice raccolta di editor isolati con una nuova veste grafica. Le sue applicazioni condividono un **Workspace Object Model (WOM)** comune, in modo che gli oggetti compatibili possano essere referenziati, incorporati, cercati, automatizzati e riutilizzati in tutta la suite.

### Principi del prodotto

- **Local-first per impostazione predefinita** — i documenti e lo stato del workspace rimangono locali a meno che l'utente non abiliti deliberatamente una funzionalità di rete.
- **Zero telemetria del prodotto per progettazione** — nessun sistema di analisi comportamentale è richiesto per il normale funzionamento del workspace.
- **Funzionamento offline e air-gap** — i flussi di lavoro essenziali sono progettati per operare senza un account cloud o una connessione Internet persistente.
- **Open Core, libero per sempre** — Astraea Open Core è rilasciato sotto licenza GNU AGPLv3 e rimane il fondamento permanentemente gratuito del prodotto.
- **Confine esplicito di Premium** — Premium aggiunge organizzazione, dati strutturati per team, pianificazione, spazi e collaborazione crittografata. Non esiste per rendere la versione gratuita intenzionalmente incompleta.
- **Oggetti trasversali tra le applicazioni** — Writer, Grid, Whiteboard, Publish, Insight, Automate e le altre applicazioni condividono oggetti workspace compatibili invece di costringere a continui copia-e-incolla.
- **Sicurezza descritta da controlli concreti** — primitive crittografiche, gestione delle chiavi, policy di rete e prove di rilascio sono documentate direttamente anziché basarsi su slogan di marketing generici.

---

# Edizioni

## Astraea Open Core — Libero per sempre

Astraea Open Core costituisce il fondamento per la produttività personale.

È **libero e open source sotto licenza GNU AGPLv3**.

Le applicazioni incluse in Open Core rimarranno parte integrante dell'edizione gratuita. Gli sviluppi futuri di Premium potranno aggiungere nuove capacità organizzative, ma l'obiettivo di Open Core è rimanere un prodotto autentico e completo, non una demo a tempo.

## Astraea Premium — Organizzazione, dati e collaborazione

Astraea Premium è il superset commerciale.

Include l'intera dotazione di Open Core e aggiunge le sei applicazioni dedicate a esecuzione di progetti, dati aziendali strutturati, spazi di lavoro condivisi e collaborazione multi-dispositivo crittografata.

> **Open Core è l'ufficio personale sovrano. Premium vi connette l'organizzazione circostante.**

### Matrice delle edizioni

| Applicazione | Open Core | Premium | Formato | Ruolo principale |
|---|:---:|:---:|:---:|---|
| **Astraea Writer** | ✅ | ✅ | `.vdoc` | Elaborazione testi, documenti strutturati, tabelle, riferimenti ed esportazione |
| **Astraea Grid** | ✅ | ✅ | `.vgrid` | Fogli di calcolo multi-foglio, formule, analisi e grafici |
| **Astraea Present** | ✅ | ✅ | `.vpresent` | Presentazioni a diapositive, scene, media e flussi di presentazione |
| **Astraea Notes** | ✅ | ✅ | `.vnote` | Note, gestione della conoscenza personale (PKM) e note collegate |
| **Astraea PDF Studio** | ✅ | ✅ | `.vpdf` | Visualizzazione PDF, annotazioni, firme e flussi di redazione/oscuramento |
| **Astraea Tasks** | ✅ | ✅ | `.vtask` | Gestione attività personali, ricorrenze, priorità e collegamenti al workspace |
| **Astraea Whiteboard** | ✅ | ✅ | `.vboard` | Lavagna infinita, diagrammi, mappe mentali e oggetti workspace live |
| **Astraea Vault** | ✅ | ✅ | `.vvault` | Credenziali crittografate, file protetti e dati sensibili del workspace |
| **Astraea Draw** | ✅ | ✅ | `.vdraw` | Disegno vettoriale, grafica a livelli e flussi di lavoro orientati a SVG |
| **Astraea Publish** | ✅ | ✅ | `.vpub` | Desktop publishing per impaginati strutturati e stampe professionali |
| **Astraea Insight** | ✅ | ✅ | `.vinsight` | Dashboard locali, metriche e viste analitiche |
| **Astraea Connect** | ✅ | ✅ | `.vconnect` | Integrazioni esterne controllate e confini di connessione espliciti |
| **Astraea Automate** | ✅ | ✅ | `.vauto` | Automazione deterministica locale dei flussi di lavoro |
| **Astraea Admin & Policy** | ✅* | ✅ | `.vpolicy` | Policy locali, amministrazione e configurazione rilevante per la sicurezza |
| **Astraea Projects** | 🔒 | ✅ | `.vproj` | Progetti, fasi, dipendenze, diagrammi di Gantt e gestione rischi |
| **Astraea Planner** | 🔒 | ✅ | `.vplan` | Kanban, carichi di lavoro, calendario e pianificazione collaborativa |
| **Astraea Database** | 🔒 | ✅ | `.vdb` | Modelli dati relazionali no-code tipizzati e viste dati integrate |
| **Astraea Forms** | 🔒 | ✅ | `.vform` | Creazione di moduli e sondaggi, flussi condizionali e risposte strutturate |
| **Astraea Spaces** | 🔒 | ✅ | `.vspace` | Spazi per team, ruoli, contesti di policy e confini organizzativi |
| **Astraea GaiaCom** | 🔒 | ✅ | `.vgcom` | Comunicazione crittografata, sincronizzazione mesh e trasporto collaborativo |

\* Open Core include le superfici di amministrazione e policy applicabili a Open Core stesso. Le funzionalità di policy operative esclusive di Premium rimangono in Premium.

### Superfici di piattaforma condivise

Le seguenti funzionalità rappresentano componenti di piattaforma del workspace e non applicazioni a pagamento separate:

- **Workspace Explorer / Library** — scopri, organizza, visualizza in anteprima e riutilizza i documenti salvati.
- **Cerca** — ricerca locale integrata su tutte le applicazioni.
- **Impostazioni** — preferenze reali e persistite del workspace e delle applicazioni.
- **Guide** — guide interattive al primo avvio e guide per applicazione.
- **Ripristino / Diagnostica** — superfici locali di recupero e risoluzione problemi.
- **Tavolozza dei comandi e navigazione shell** — piano di controllo unificato del workspace.

---

# Workspace Explorer

Astraea Workspace integra un **Workspace Explorer** centralizzato, in modo che gli utenti non debbano ricordare quale applicazione abbia aperto un documento per poterlo riutilizzare.

L'Explorer rende il lavoro salvato reperibile in tutta la suite:

```text
Tutti i file
Recenti
Aperti
Preferiti
Raccolte
Cerca
Anteprima
Apri sorgente
Inserisci da Workspace
Drag & Drop
```

La distinzione fondamentale è semantica.

Un file `.vgrid` trascinato in Writer non viene trattato come un semplice file binario grezzo. Astraea offre le operazioni pertinenti per sorgente e destinazione, quali:

```text
Intervallo live (Live range)
Istantanea congelata (Frozen snapshot)
Copia come tabella di Writer
Apri sorgente
```

Lo stesso modello supporta oggetti compatibili tra Writer, Grid, Present, Whiteboard, Publish, Insight, Automate e le altre applicazioni del workspace.

---

# Local-first non significa isolato

Astraea è progettato per funzionare prioritariamente in locale, ma local-first non equivale a "non comunicare mai".

Open Core è pienamente utilizzabile senza alcun account cloud.

Premium può abilitare sincronizzazione crittografata, spazi di lavoro e collaborazione GaiaCom non appena l'utente o l'organizzazione li attiva esplicitamente.

Le funzionalità connesse rimangono sempre delimitate da policy chiare e non alterano il modello di proprietà dei documenti locali.

---

# Architettura di sicurezza

Astraea Workspace segue un design di **calcolo locale a modello Zero-Trust**.

Il progetto documenta meccanismi di sicurezza concreti invece di affidarsi a espressioni generiche come "sicurezza di livello militare".

## Contenitori crittografati VWC

I documenti nativi del workspace sono archiviati mediante l'architettura a contenitore di Astraea.

I controlli rilevanti includono:

- Crittografia autenticata tramite moderne costruzioni AEAD come **AES-256-GCM** e **ChaCha20-Poly1305**, ove applicabile;
- **Argon2id** per la derivazione della chiave basata su passphrase, qualora una passphrase faccia parte della catena di chiavi;
- Controlli di integrità e autenticazione sui dati dei contenitori;
- Parsing e validazione limitati ai confini di fiducia dei file;
- Versionamento e percorsi di migrazione espliciti.

Algoritmi e profili precisi sono dettagli di implementazione documentati nell'architettura e nelle prove di rilascio, non ridotti a slogan pubblicitari.

## VGT Infinity Cryptographic Core

Astraea Workspace integra il **VGT Infinity Cryptographic Core** come sottosistema di sicurezza nativo di prima parte.

Nell'attuale architettura del repository, Infinity risiede in:

```text
vendor/infinity
```

e fornisce i componenti crittografici avanzati utilizzati dai profili di sicurezza di Astraea, tra cui:

- Profili di scambio chiavi ibridi classici / post-quantum;
- Supporto standardizzato per **ML-KEM** nei profili previsti;
- **ML-DSA** e ulteriori primitive di firma per i profili supportati;
- Costruzioni di crittografia simmetrica autenticata;
- Profili compositi ad alta sicurezza in grado di combinare più primitive indipendenti;
- Separazione esplicita delle chiavi, verifica dell'integrità e gestione della memoria sicura implementate dal sottosistema Infinity;
- Isolamento del provider crittografico laddove una primitiva sia fornita tramite un confine sidecar/provider delimitato.

L'integrazione di Infinity include profili post-quantum e compositi specializzati che vanno oltre la baseline minima ML-KEM / ML-DSA. Algoritmi attivi, versioni dei provider e composizione dei profili sono trattati come **fatti comprovati dal rilascio**: la distinta base software (SBOM), i file lock, il documento di architettura e il manifesto di rilascio costituiscono le fonti autoritative per ciascuna build.

Questa distinzione è sostanziale: Astraea non sostiene che combinare algoritmi crei una sicurezza magica o matematicamente inviolabile. Infinity funge da strato crittografico nativo addizionale, i cui profili vengono scelti e verificati esplicitamente.

## Supporto post-quantum

Attraverso l'integrazione di Infinity e lo stack di sicurezza nativo, il workspace supporta componenti crittografici predisposti per l'era post-quantistica, incluse le famiglie standardizzate **ML-KEM** e **ML-DSA** nei profili pertinenti.

La crittografia post-quantistica riduce rischi crittografici specifici a lungo termine; essa **non** costituisce una garanzia generica contro qualunque attacco futuro.

## NetGate

L'accesso alla rete si basa su policy esplicite anziché su un traffico in uscita illimitato per impostazione predefinita.

Ove si applichi la policy NetGate, l'accesso in uscita è regolato da allowlist e può essere bloccato prima dell'utilizzo a livello applicativo. Connettori e trasporti collaborativi devono attraversare confini di policy definiti.

## Protezione delle chiavi basata sul sistema operativo

Astraea si integra con i servizi di protezione delle chiavi del sistema operativo ove disponibili:

- **Windows:** DPAPI / Gestione credenziali di Windows
- **macOS:** Portachiavi (Keychain), con protezione hardware supportata dal dispositivo e dalla configurazione
- **Linux:** Secret Service / archivi chiavi compatibili con libsecret ove presenti

La protezione basata su hardware dipende dalle capacità del sistema e non è presunta su ogni macchina.

## Prove di sicurezza (Security Evidence)

I rilasci ufficiali sono accompagnati da elementi verificabili:

- Inventario delle dipendenze e delle licenze;
- SPDX SBOM;
- Hash di rilascio (SHA-256);
- Manifesto di rilascio firmato;
- Tracciabilità della build (provenance) ove generata dalla pipeline di rilascio.

Il set di artefatti pubblicato con un rilascio costituisce la fonte autoritativa per tale versione.

---

# Architettura

Astraea unisce un core in Rust a una shell desktop Tauri e a un'interfaccia in React e TypeScript.

```text
┌─────────────────────────────────────────────────────────────┐
│                    Astraea Desktop Shell                    │
│                         Tauri v2                            │
│                                                             │
│  ┌───────────────────────────────────────────────────────┐  │
│  │              React / TypeScript UI                   │  │
│  │                                                       │  │
│  │  Workspace Shell · Explorer · Editor · Impostazioni  │  │
│  │  Guide · Ricerca · Superfici Oggetti Cross-App       │  │
│  └─────────────────────────┬─────────────────────────────┘  │
│                            │ IPC tipizzata                  │
│  ┌─────────────────────────▼─────────────────────────────┐  │
│  │                    Rust Core                          │  │
│  │                                                       │  │
│  │  WOM · VWC · Ricerca · Policy · Interop · Recupero   │  │
│  │  Crypto · Automazione · NetGate · Integr. Nativa     │  │
│  └─────────────────────────┬─────────────────────────────┘  │
└────────────────────────────┼────────────────────────────────┘
                             │
                OS nativo / archiviazione locale /
                key store di sistema / connettori espliciti
```

### Perché Tauri?

Tauri utilizza la WebView del sistema operativo anziché includere un runtime browser completo per ogni applicazione. Ciò riduce notevolmente le dimensioni del pacchetto mantenendo un core prestante e sicuro in Rust.

Consulta la documentazione ufficiale sull'architettura di Tauri:  
https://tauri.app/concept/architecture/

### Strategia di controllo nativo (First-Party)

Astraea mantiene sotto diretto controllo ingegneristico le funzioni critiche del workspace:

- Workspace Object Model
- Editor del workspace
- Semantica dei documenti e dei riferimenti
- Integrazione della ricerca locale
- Motore di policy (Policy Engine)
- Runtime di automazione
- Orchestrazione dell'interoperabilità
- Contenitori crittografati del workspace
- Integrazione del **VGT Infinity Cryptographic Core** per profili di sicurezza avanzati

Librerie di terze parti vengono impiegate ove tecnicamente opportuno, in particolare per primitive crittografiche auditate, integrazione con il sistema operativo e componenti di rendering mirati.

L'albero esatto delle dipendenze è riportato nello SBOM generato, non in testi promozionali.

---

# Prestazioni e consumo di risorse

Astraea è progettato per evitare duplicazioni inutili a runtime.

Grazie all'utilizzo della WebView di sistema da parte di Tauri, Astraea non include un'istanza Chromium autonoma come avviene nelle classiche applicazioni Electron. Questa scelta architettonica riduce il sovraccarico di memoria e di processo, sebbene l'uso effettivo della RAM dipenda sempre da sistema operativo, documenti aperti, implementazione della WebView, anteprime, indici di ricerca e applicazioni attive.

## Rilevazione attuale pre-rilascio

Sulla build di riferimento pre-rilascio per Windows, i test interni hanno rilevato approssimativamente:

**~100–150 MB di RAM in idle senza documenti aperti**

Si tratta di una **misurazione interna pre-rilascio** e non di una garanzia universale. I dati finali saranno pubblicati unitamente a sistema operativo, build, versione della WebView, stato dei documenti e metodo di misurazione.

## Perché non pubblichiamo cifre di RAM ingannevoli sui concorrenti

I confronti sull'uso della RAM tra suite per l'ufficio possono facilmente risultare fuorvianti.

Microsoft Word con un documento vuoto, un browser con Google Documenti, LibreOffice con Base (Java) e un editor desktop multi-processo rappresentano carichi di lavoro non comparabili.

Per questo motivo, la tabella sottostante riporta i **requisiti di sistema ufficiali dichiarati dai produttori**, anziché benchmark di inattività arbitrari:

| Prodotto | Requisito di memoria ufficiale / Riferimento | Lavoro desktop offline | Fonte |
|---|---:|:---:|---|
| **Astraea Workspace** | Rilevazione interna pre-rilascio: ~100–150 MB idle; 4 GB RAM consigliati per un uso confortevole | ✅ | Misurazione VGT pre-rilascio |
| **Microsoft 365 Apps** | 4 GB di RAM su requisiti attuali Windows / macOS | ✅ App desktop | [Microsoft](https://support.microsoft.com/it-it/office/requisiti-di-sistema-per-microsoft-365-per-casa-71423642-bbbb-4811-93e3-add3ff2d3192) |
| **LibreOffice** | Minimo 256 MB di RAM, 512 MB consigliati su Windows/Linux | ✅ | [LibreOffice](https://it.libreoffice.org/scarica/requisiti-di-sistema/) |
| **ONLYOFFICE Desktop Editors** | 2 GB di RAM o superiore | ✅ | [ONLYOFFICE](https://helpcenter.onlyoffice.com/it/desktop/installation/desktop-sys-reqs-windows.aspx) |
| **Google Documenti / Fogli / Presentazioni** | Dipendente dal browser; nessuna cifra desktop standalone comparabile | ⚠️ Modalità offline disponibile dopo configurazione | [Google](https://support.google.com/docs/answer/6388102?hl=it) |

> **Importante:** memoria di sistema minima e working set misurato di un'applicazione sono grandezze diverse. La tabella è inclusa a scopo di contesto e non pretende di renderle intercambiabili.

Un benchmark riproducibile di Astraea deve indicare almeno:

```text
Avvio a freddo (Cold launch)
Idle dopo stabilizzazione
Carico documento Writer
Carico di calcolo Grid
Carico documenti PDF
Stato indicizzazione di ricerca
Peak working set
Private working set
Utilizzo CPU in idle
OS di prova / WebView / hash della build
```

---

# Un confronto equilibrato con le altre suite di produttività

Astraea non ha bisogno di affermazioni inesatte su altri prodotti per spiegare il proprio posizionamento.

I programmi desktop di Microsoft 365 possono salvare i file in locale o su OneDrive / SharePoint. Google Documenti, Fogli e Presentazioni supportano una modalità offline previa attivazione. LibreOffice e ONLYOFFICE Desktop Editors lavorano nativamente offline con file locali.

La differenza perseguita da Astraea non è semplicemente "le altre suite richiedono il cloud".

È la **combinazione** di sovranità locale sui dati, modello condiviso di oggetti workspace, policy di rete esplicite, contenitori crittografati integrati, edizione Open Core gratuita e un'interfaccia comune che abbraccia ufficio, conoscenza, sicurezza e automazione.

| Caratteristica | Astraea Workspace | Microsoft 365 | Google Workspace | LibreOffice | ONLYOFFICE Desktop |
|---|---|---|---|---|---|
| **Modello primario** | Workspace desktop local-first | Desktop + servizi cloud | Suite web cloud-first | Suite desktop locale | Suite desktop locale + cloud opzionale |
| **Flussi su file locali** | ✅ Di primo livello | ✅ Supportati | ⚠️ Modalità offline per editor supportati | ✅ | ✅ |
| **Account cloud obbligatorio per l'editing locale** | No | Dipende dal prodotto/licenza | Servizio basato su account | No | No |
| **Fondamento desktop open-source** | ✅ Open Core, AGPLv3 | No | No | ✅ MPLv2 | ✅ AGPLv3 |
| **Modello di oggetti condiviso Astraea** | ✅ WOM | Architettura differente | Architettura differente | Architettura differente | Architettura differente |
| **Contenitori crittografati Astraea** | ✅ | Architettura differente | Architettura differente | Architettura differente | Architettura differente |
| **Zero telemetria per progettazione Astraea** | ✅ | Specifico del fornitore | Specifico del fornitore | Specifico del progetto | Specifico del fornitore |
| **Espansione commerciale team/dati** | ✅ Premium | ✅ | ✅ | Ecosistema / terze parti | ✅ |

Riferimenti ufficiali utilizzati per il confronto:

- Comportamento di salvataggio locale/cloud Microsoft: https://support.microsoft.com/it-it/office/salvare-i-file-in-microsoft-365-70da744d-0f4d-472e-9f6d-b6480b556942
- Modifica offline Google: https://support.google.com/docs/answer/6388102?hl=it
- Requisiti di sistema LibreOffice: https://it.libreoffice.org/scarica/requisiti-di-sistema/
- Funzionamento desktop offline ONLYOFFICE: https://helpcenter.onlyoffice.com/it/desktop/getting-started.aspx

---

# Le 20 applicazioni integrate

## Ufficio & Editoria

### Astraea Writer — `.vdoc`
Elaborazione professionale di documenti, tipografia, stili, tabelle, riferimenti, contenuti strutturati ed esportazione.

### Astraea Grid — `.vgrid`
Fogli di calcolo multi-foglio, formule avanzate, analisi, grafici e gestione di flussi tabellari.

### Astraea Present — `.vpresent`
Presentazioni vettoriali, composizione delle diapositive, gestione multimediale e viste relatore.

### Astraea Publish — `.vpub`
Desktop publishing per brochure, pubblicazioni, layout complessi e composizione orientata alla stampa.

## Conoscenza, Ideazione & Creatività

### Astraea Notes — `.vnote`
Gestione della conoscenza personale (PKM), note collegate, supporto Markdown e relazioni concettuali.

### Astraea Whiteboard — `.vboard`
Lavagna infinita, diagrammi, mappe mentali, pianificazione visiva e oggetti workspace live.

### Astraea Draw — `.vdraw`
Disegno vettoriale, livelli, tracciati Bézier e grafica orientata al formato SVG.

### Astraea PDF Studio — `.vpdf`
Visualizzazione e modifica PDF con annotazioni, firme e redazione/oscuramento controllato.

## Attività, Pianificazione & Esecuzione

### Astraea Tasks — `.vtask`
Gestione attività personali, ricorrenze, priorità, sotto-attività e collegamenti diretti a oggetti del workspace.

### Astraea Planner — `.vplan` — Premium
Bacheche Kanban, distribuzione del carico di lavoro, scadenze e pianificazione collaborativa.

### Astraea Projects — `.vproj` — Premium
Fasi di progetto, milestone, dipendenze, diagrammi di Gantt e gestione del rischio.

## Dati, Moduli & Analisi

### Astraea Forms — `.vform` — Premium
Creazione di moduli, questionari, logiche condizionali e raccolta strutturata delle risposte.

### Astraea Database — `.vdb` — Premium
Modelli dati relazionali tipizzati, record strutturati e viste integrate nel workspace.

### Astraea Insight — `.vinsight`
Viste analitiche locali, indicatori chiave (KPI), dashboard e intelligence derivata dal workspace.

## Sicurezza, Automazione & Connettività

### Astraea Vault — `.vvault`
Credenziali crittografate, file protetti e contenuti sensibili del workspace.

### Astraea Spaces — `.vspace` — Premium
Spazi per team e organizzazioni con gestione di ruoli e policy.

### Astraea Connect — `.vconnect`
Connettori esterni controllati e confini di integrazione espliciti.

### Astraea Automate — `.vauto`
Automazione deterministica locale dei flussi di lavoro.

### Astraea Admin & Policy — `.vpolicy`
Amministrazione rilevante per la sicurezza, stato delle policy e configurazione conforme all'edizione installata.

### Astraea GaiaCom — `.vgcom` — Premium
Comunicazione crittografata e sincronizzazione sicura per ambienti di lavoro collaborativi.

---

# Prezzi e licenze

## Open Core

| Edizione | Prezzo | Licenza | Disponibilità |
|---|---:|---|---|
| **Astraea Open Core** | **€0** | **GNU AGPLv3** | Libero per sempre |

Open Core non ha scadenza e non richiede alcun abbonamento.

## Licenze Premium pianificate

Astraea Premium è pianificato con una **licenza commerciale perpetua**, non come un abbonamento periodico obbligatorio.

| Edizione | Disponibilità prevista | Prezzo una tantum previsto | Upgrade major version previsto |
|---|---:|---:|---:|
| **Premium Beta Early-Bird** | Nov 2026 – Feb 2027 | **€39,99** | **~€45,99** |
| **Premium Regular** | Da marzo 2027 | **€69,00** | **~€45,99** |
| **Non-Profit & Istruzione** | Organizzazioni ammissibili | **€36,99** | **€9,99** |

> [!NOTE]
> Premium non è ancora stato lanciato ufficialmente. Le condizioni commerciali mostrate prima del lancio rappresentano la pianificazione attuale e devono essere considerate prezzi pre-rilascio fino all'apertura pubblica dell'acquisto e delle licenze.

---

# Installazione

## Binari pubblici

Gli installer ufficiali e i pacchetti di rilascio saranno resi disponibili in **GitHub Releases** al superamento dei gate di rilascio pubblico.

Piattaforme di destinazione:

```text
Windows
macOS
Linux
```

La disponibilità potrà variare in base alla piattaforma nel caso in cui un gate specifico per un sistema operativo sia ancora in fase di completamento.

## Compilazione dai sorgenti

### Prerequisiti

- Node.js 20 LTS o 22 LTS
- Rust / Cargo
- Tauri CLI v2
- Prerequisiti di compilazione specifici per la piattaforma Tauri

### Interfaccia utente (UI)

```bash
cd ui
npm ci
npm run typecheck
npm run build
```

### Shell desktop

```bash
cd crates/vgt-desktop
cargo tauri dev
```

Creazione del pacchetto di produzione:

```bash
cargo tauri build
```

> I comandi di compilazione e le versioni della toolchain devono rispettare i lockfile del repository e la documentazione di rilascio aggiornata, qualora differiscano dagli esempi sopra riportati.

---

# Requisiti di sistema

Obiettivo pre-rilascio attuale:

- **RAM:** Minimo 4 GB di memoria di sistema, 8 GB consigliati per flussi di lavoro multi-documento estesi
- **Spazio su disco:** La dimensione finale installata sarà comunicata con il pacchetto di rilascio
- **Schermo:** Monitor desktop moderno; il ridimensionamento per l'accessibilità è supportato nativamente dall'interfaccia
- **Internet:** Non richiesta per l'elaborazione locale di base; necessaria unicamente per funzioni di rete esplicitamente abilitate dall'utente, aggiornamenti o connettori esterni

Le versioni minime ufficiali dei sistemi operativi saranno pubblicate insieme agli artefatti di rilascio.

---

# Prontezza al rilascio (Release Readiness)

Il masterplan originale di implementazione del core ha raggiunto:

```text
3334 / 3334
```

Questo traguardo attesta il completamento della checklist di implementazione del core.

Esso **non** implica di per sé che il rilascio pubblico sia concluso.

La beta pubblica richiede un processo di preparazione dedicato che include:

```text
Separazione fisica del sorgente delle due edizioni
Confini di funzionalità tra Open Core e Premium
Workspace Explorer / Library
Flussi di inserimento e drag/drop tra applicazioni
Rinnovamento del design system
Verifica dei temi su tutte le viste
Guide interattive
Collegamento delle impostazioni
Localizzazione
Accessibilità
Prove di sicurezza (Security Evidence)
Roundtrip end-to-end completi
Test di regressione su import / export
Comportamento di ripristino
Prestazioni
Pacchettizzazione
SBOM / hash / tracciabilità della build
Controllo dei difetti visibili al rilascio
```

Lo stato del repository passerà da **Pre-Release** a **Beta** unicamente quando tali requisiti saranno attestati dall'effettivo albero di rilascio.

---

# Documentazione

Documentazione tecnica e di prodotto disponibile:

| Documento | Lingua | Tipo |
|---|:---:|---|
| [What is Astraea Workspace?](./01_Astraea_Workspace_What_It_Is_EN.pdf) | Inglese | Prodotto / concetto |
| [Premium Security & Sovereignty](./02_Astraea_Workspace_Premium_Security_Sovereignty_EN.pdf) | Inglese | Whitepaper tecnico |
| [Was ist Astraea Workspace?](./01_Astraea_Workspace_Was_es_ist_DE.pdf) | Tedesco | Prodotto / concetto |
| [Premium Sicherheit & Souveränität](./02_Astraea_Workspace_Premium_Sicherheit_Souveraenitaet_DE.pdf) | Tedesco | Whitepaper tecnico |
| [Produktivität & Datenfluss](./03_Astraea_Workspace_Premium_Produktivitaet_Datenfluss_DE.pdf) | Tedesco | Architettura di prodotto |
| [Che cos'è Astraea Workspace?](./01_Astraea_Workspace_Che_Cose_IT.pdf) | Italiano | Prodotto / concetto |
| [Sicurezza Premium & Sovranità](./02_Astraea_Workspace_Premium_Sicurezza_Sovranita_IT.pdf) | Italiano | Whitepaper tecnico |
| [¿Qué es Astraea Workspace?](./01_Astraea_Workspace_Que_Es_ES.pdf) | Spagnolo | Prodotto / concetto |
| [Seguridad Premium & Soberanía](./02_Astraea_Workspace_Premium_Seguridad_Soberania_ES.pdf) | Spagnolo | Whitepaper tecnico |
| [Qu'est-ce qu'Astraea Workspace ?](./01_Astraea_Workspace_Ce_Que_Cest_FR.pdf) | Francese | Prodotto / concetto |
| [Sécurité Premium & Souveraineté](./02_Astraea_Workspace_Premium_Securite_Souverainete_FR.pdf) | Francese | Whitepaper tecnico |
| [Что такое Astraea Workspace?](./01_Astraea_Workspace_What_It_Is_RU.pdf) | Russo | Prodotto / concetto |
| [Премиальная безопасность и суверенитет](./02_Astraea_Workspace_Premium_Security_Sovereignty_RU.pdf) | Russo | Whitepaper tecnico |

---

# Trasparenza della catena di fornitura (Supply Chain)

Il processo di rilascio di Astraea è concepito per rendere ispezionabile il prodotto distribuito:

Le prove di rilascio ufficiali includono, ove prodotte dalla pipeline finale:

```text
Inventario di dipendenze e licenze
SPDX SBOM
Hash di rilascio SHA-256
Manifesto di rilascio firmato
Tracciabilità della build (provenance)
```

Gli artefatti generati costituiscono la fonte autoritativa per le versioni delle dipendenze.

Questo README evita intenzionalmente di mantenere una tabella manuale delle dipendenze soggetta a discrepanze rispetto a `Cargo.lock`, `package-lock.json`, `go.sum` e allo SBOM generato.

---

# Licenza

**Astraea Workspace Open Core è rilasciato sotto licenza GNU Affero General Public License v3.0 (AGPL-3.0).**

Vedere:

- [`LICENSE`](./LICENSE)
- [`NOTICE`](./NOTICE), ove presente
- Note specifiche per le singole dipendenze e SBOM di rilascio

Astraea Premium è distribuito separatamente con licenza commerciale proprietaria.

---

# Visione

Il software deve aiutare le persone a creare, pianificare, analizzare e collaborare senza pretendere che rinuncino alla proprietà del proprio ambiente di lavoro.

Astraea Workspace è costruito su questa premessa:

**locale quando il lavoro locale è sufficiente, esplicito quando è richiesta la rete, aperto laddove si applica la promessa Open Core, e interoperabile in tutto lo spazio di lavoro anziché frammentato in strumenti isolati.**

<p align="center">
  <strong>Astraea Workspace</strong><br>
  <em>Your Mind. Your Work. Your Sovereignty.</em><br><br>
  <sub>© 2026 VisionGaiaTechnology · Open Core concesso in licenza sotto AGPL-3.0</sub>
</p>
