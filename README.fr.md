<p align="center">
  <img src="./astraeaworkspace1.png" alt="Astraea Workspace" width="680"/>
</p>

<p align="center">
  <a href="./README.md">English</a> ·
  <a href="./README.de.md">Deutsch</a> ·
  <a href="./README.it.md">Italiano</a> ·
  <a href="./README.es.md">Español</a> ·
  <b>Français</b> ·
  <a href="./README.ru.md">Русский</a>
</p>

<p align="center">
  <strong>Un espace de productivité souverain et local, conçu pour la maîtrise absolue de vos données.</strong><br>
  <em>Local-first · Zéro télémétrie de produit dès la conception · Conteneurs chiffrés et authentifiés · Sécurité parée pour l'ère post-quantique · Open Core</em>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Statut-Public%20Beta%20Pre--Release-FFB300?style=for-the-badge" alt="Public Beta Pre-Release"/>
  <img src="https://img.shields.io/badge/Core%20Jalon-3334%2F3334-00C853?style=for-the-badge&logo=checkmarx&logoColor=white" alt="Core jalon 3334/3334"/>
  <img src="https://img.shields.io/badge/Core-Rust%202021-DEA584?style=for-the-badge&logo=rust&logoColor=white" alt="Rust Core"/>
  <img src="https://img.shields.io/badge/Shell-Tauri%20v2-24C8D8?style=for-the-badge&logo=tauri&logoColor=white" alt="Tauri v2"/>
  <img src="https://img.shields.io/badge/UI-React%2019%20%7C%20TypeScript-61DAFB?style=for-the-badge&logo=react&logoColor=black" alt="React et TypeScript"/>
  <img src="https://img.shields.io/badge/Licence-AGPLv3-00B0FF?style=for-the-badge" alt="AGPLv3"/>
</p>

---

> [!IMPORTANT]
> ## Statut de la version publique
>
> **Astraea Workspace est en phase finale de durcissement pré-version.**
>
> Le jalon de mise en œuvre du noyau (core) est franchi. Le cycle actuel se concentre sur la séparation physique des éditions, la vérification complète des flux de travail de bout en bout, le Workspace Explorer, la cohérence visuelle, l'accessibilité, la localisation, les preuves de sécurité formelles, le packaging et les tests de non-régression finaux.
>
> Les paquets officiels ne seront publiés qu'une fois l'ensemble des critères de publication (release gates) validé. D'ici là, l'atteinte d'un jalon sur une liste de contrôle interne ne doit pas être assimilée à une version publique définitivement livrée et éprouvée.

---

## Qu'est-ce qu'Astraea Workspace ?

Astraea Workspace est une suite bureautique et de productivité conçue autour d'un principe limpide :

**Votre travail doit rester utilisable, compréhensible et sous votre contrôle absolu, même lorsqu'aucun service en ligne n'est disponible.**

Elle réunit au sein d'un environnement unifié l'édition documentaire, la gestion des connaissances, la création visuelle, l'automatisation, la recherche locale, le stockage chiffré et des objets de travail transversaux.

Les flux de travail fondamentaux sont **local-first** (priorité au local). Les fonctionnalités connectées sont des capacités optionnelles explicites et ne conditionnent en aucun cas l'ouverture ou la modification de vos fichiers.

Astraea ne constitue pas une simple juxtaposition d'éditeurs hétérogènes réhabillés. Toutes ses applications partagent un **Workspace Object Model (WOM)** universel, permettant aux objets compatibles d'être référencés, intégrés, indexés, automatisés et réutilisés dans toute la suite.

### Principes directeurs

- **Local-first par défaut** — les documents et l'état de l'espace de travail restent stockés en local, à moins que l'utilisateur n'active délibérément une fonctionnalité réseau.
- **Zéro télémétrie de produit dès la conception** — aucun système d'analyse comportementale n'est requis pour le fonctionnement normal du logiciel.
- **Opérationnel hors-ligne et air-gap** — les flux d'édition essentiels fonctionnent sans compte distant ni connexion permanente à Internet.
- **Open Core, gratuit pour toujours** — Astraea Open Core est distribué sous licence libre GNU AGPLv3 et demeure le socle permanent et gratuit du projet.
- **Frontière Premium explicite** — l'édition Premium apporte l'organisation d'entreprise, les bases de données structurées, la planification, les espaces partagés et la collaboration chiffrée. Elle n'a pas pour but de rendre l'édition libre artificiellement incomplète.
- **Objets transversaux entre applications** — Writer, Grid, Whiteboard, Publish, Insight, Automate et les autres outils échangent des objets compatibles sans imposer de simples copier-coller de texte brut.
- **Sécurité fondée sur des contrôles concrets** — les briques cryptographiques, la gestion des clés, la politique réseau et les éléments de preuve sont documentés sans artifice commercial.

---

# Éditions

## Astraea Open Core — Gratuit pour toujours

Astraea Open Core est le socle dédié à la productivité personnelle.

Il est **libre et open source sous licence GNU AGPLv3**.

Les applications intégrées à Open Core demeurent définitivement associées à la version libre. Les développements futurs de l'offre Premium apporteront de nouveaux outils d'organisation, mais la vocation d'Open Core est de constituer un produit complet et autonome, non une version d'essai bridée dans le temps.

## Astraea Premium — Organisation, données et collaboration

Astraea Premium constitue l'ensemble commercial supérieur.

Il comprend l'intégralité d'Open Core et intègre en complément six applications consacrées à la conduite de projets, aux données d'entreprise structurées, aux espaces d'équipe et au travail collaboratif chiffré multi-appareils.

> **Open Core est l'espace bureautique personnel souverain. Premium fédère l'organisation qui l'entoure.**

### Matrice des éditions

| Application | Open Core | Premium | Format | Rôle principal |
|---|:---:|:---:|:---:|---|
| **Astraea Writer** | ✅ | ✅ | `.vdoc` | Traitement de texte, documents structurés, tableaux, références et exportations |
| **Astraea Grid** | ✅ | ✅ | `.vgrid` | Tableur multi-feuilles, calcul formel, analyses et graphiques |
| **Astraea Present** | ✅ | ✅ | `.vpresent` | Présentations de diapositives, scènes visuelles, médias et modes de projection |
| **Astraea Notes** | ✅ | ✅ | `.vnote` | Prise de notes, gestion des connaissances personnelles (PKM) et liens conceptuels |
| **Astraea PDF Studio** | ✅ | ✅ | `.vpdf` | Consultation de PDF, annotations, signatures et caviardage sécurisé |
| **Astraea Tasks** | ✅ | ✅ | `.vtask` | Gestion des tâches individuelles, périodicité, priorités et liens de contexte |
| **Astraea Whiteboard** | ✅ | ✅ | `.vboard` | Tableau blanc infini, diagrammes, schémas heuristiques et objets dynamiques |
| **Astraea Vault** | ✅ | ✅ | `.vvault` | Coffre-fort chiffré pour identifiants, fichiers confidentiels et secrets |
| **Astraea Draw** | ✅ | ✅ | `.vdraw` | Dessin vectoriel, composition multi-calques et graphismes SVG |
| **Astraea Publish** | ✅ | ✅ | `.vpub` | PAO / Publication assistée par ordinateur pour mises en page éditoriales et impression |
| **Astraea Insight** | ✅ | ✅ | `.vinsight` | Tableaux de bord locaux, indicateurs de performance et vues analytiques |
| **Astraea Connect** | ✅ | ✅ | `.vconnect` | Intégrations externes sécurisées et cloisons de connectivité explicites |
| **Astraea Automate** | ✅ | ✅ | `.vauto` | Automatisation locale et déterministe de scénarios de travail |
| **Astraea Admin & Policy** | ✅* | ✅ | `.vpolicy` | Administration locale, gestion des stratégies et configuration sécurisée |
| **Astraea Projects** | 🔒 | ✅ | `.vproj` | Gestion de projets, jalons, dépendances, diagrammes de Gantt et analyse des risques |
| **Astraea Planner** | 🔒 | ✅ | `.vplan` | Tableaux Kanban, répartition des charges de travail et planification d'équipe |
| **Astraea Database** | 🔒 | ✅ | `.vdb` | Modélisation relationnelle no-code typée et jeux de données connectés |
| **Astraea Forms** | 🔒 | ✅ | `.vform` | Conception de formulaires et d'enquêtes, embranchements conditionnels |
| **Astraea Spaces** | 🔒 | ✅ | `.vspace` | Espaces partagés d'équipe, droits d'accès granulaires et périmètres d'organisation |
| **Astraea GaiaCom** | 🔒 | ✅ | `.vgcom` | Échanges chiffrés, synchronisation de maillage et transport collaboratif |

\* Open Core intègre les interfaces d'administration et de gestion des règles adaptées à son propre périmètre. Les fonctionnalités d'administration d'entreprise demeurent exclusives à Premium.

### Surfaces de plateforme transversales

Ces éléments font partie intégrante de la plateforme et ne constituent pas des applications payantes distinctes :

- **Workspace Explorer / Library** — repérer, classer, prévisualiser et réutiliser l'ensemble des documents enregistrés.
- **Recherche** — moteur de recherche local fédéré entre applications.
- **Paramètres** — préférences persistantes du poste de travail et des logiciels.
- **Guides** — didacticiels pas à pas de première prise en main et par application.
- **Récupération / Diagnostic** — outils locaux de maintenance et de reprise après incident.
- **Palette de commandes et navigation** — console de pilotage unifiée de l'espace de travail.

---

# Workspace Explorer

Astraea Workspace propose un **Workspace Explorer** unifié évitant à l'utilisateur d'avoir à déterminer quel outil a ouvert un document pour pouvoir en exploiter le contenu.

L'Explorer rend les créations accessibles dans toute la suite :

```text
Tous les fichiers
Récents
Ouverts
Favoris
Collections
Recherche
Aperçu
Ouvrir la source
Insérer depuis le Workspace
Glisser-déposer (Drag & Drop)
```

La valeur fondamentale repose sur l'intelligence sémantique.

Un fichier `.vgrid` glissé dans Writer n'est pas traité comme un binaire opaque. Astraea suggère les actions adaptées aux formats en présence :

```text
Plage dynamique en direct (Live range)
Instantané figé (Frozen snapshot)
Copier comme tableau natif Writer
Ouvrir la source
```

Le même mécanisme unifie le partage d'objets entre Writer, Grid, Present, Whiteboard, Publish, Insight, Automate et les autres environnements de la suite.

---

# Priorité au local ne signifie pas isolement

Astraea est conçu pour fonctionner en local, mais cette approche n'implique pas le refus absolu de toute communication.

Open Core offre une autonomie totale sans exiger de compte cloud.

L'édition Premium permet d'activer la synchronisation chiffrée, les espaces de travail partagés et la collaboration GaiaCom lorsque l'utilisateur ou l'entreprise en exprime le besoin.

Les fonctions réseau restent strictement encadrées par des règles formelles et ne remettent jamais en cause la propriété souveraine de vos documents locaux.

---

# Architecture de sécurité

Astraea Workspace s'appuie sur une conception de **confiance zéro pour l'informatique locale (Zero-Trust Local-Computing)**.

Le projet détaille ses dispositifs techniques sans recourir à des formules floues comme "sécurité de niveau militaire".

## Conteneurs chiffrés VWC

Les documents de la suite sont stockés au moyen de l'architecture de conteneurs Astraea.

Les mesures mises en œuvre comprennent :

- Chiffrement authentifié via des constructions AEAD actuelles telles qu'**AES-256-GCM** et **ChaCha20-Poly1305** ;
- Dérivation de clés par **Argon2id** dès lors qu'un mot de passe intervient dans le processus ;
- Vérifications d'intégrité et contrôles d'authenticité des données de conteneur ;
- Analyse syntaxique stricte et validation rigoureuse aux limites d'ingestion de fichiers ;
- Gestion explicite des versions et des procédures de migration.

Les algorithmes et profils retenus constituent des détails d'implémentation documentés dans l'architecture et les preuves de conformité, et non de simples arguments promotionnels.

## VGT Infinity Cryptographic Core

Astraea Workspace intègre le **VGT Infinity Cryptographic Core** en tant que sous-système de sécurité natif direct.

Au sein de l'arborescence actuelle du dépôt, Infinity est situé sous :

```text
vendor/infinity
```

et fournit les composants cryptographiques avancés employés par les profils d'Astraea :

- Profils d'échange de clés hybrides classique / post-quantique ;
- Prise en charge standardisée de **ML-KEM** sur les profils dédiés ;
- **ML-DSA** et primitives de signature numérique complémentaires ;
- Schémas de chiffrement symétrique authentifié renforcé ;
- Profils composites combinant plusieurs algorithmes indépendants pour une robustesse accrue ;
- Découpage strict des clés, vérification d'intégrité et gestion étanche de la mémoire assurés par le composant Infinity ;
- Cloisonnement matériel et logiciel lorsque les opérations sont déléguées à des modules d'exécution isolés.

L'intégration d'Infinity inclut des profils composites et post-quantiques spécialisés excédant le socle de base ML-KEM / ML-DSA. Les algorithmes effectifs, versions de bibliothèques et architectures de profils constituent des **faits vérifiables de livraison** : le SBOM définitif, les fichiers de verrouillage (lockfiles), les fiches techniques et le manifeste de version font seuls foi pour un exécutable donné.

Cette précision est capitale : Astraea ne prétend pas qu'empiler des algorithmes produit une invulnérabilité miraculeuse. Infinity intervient comme une couche cryptographique souveraine dont chaque configuration est scrupuleusement testée.

## Sécurité post-quantique

Grâce à l'intégration d'Infinity et au socle de sécurité natif, le poste de travail intègre des briques prêtes pour l'ère post-quantique, notamment les standards **ML-KEM** et **ML-DSA** sur les profils compatibles.

La cryptographie post-quantique atténue des risques précis à long terme ; elle **ne garantit pas** une immunité universelle contre toute forme d'attaque future.

## NetGate

Les communications réseau sont assujetties à des règles explicites plutôt qu'à une autorisation générale par défaut.

Dès lors qu'une stratégie NetGate est en vigueur, les flux sortants sont filtrés par liste blanche et peuvent être interceptés avant toute émission au niveau applicatif. Les connecteurs tiers et transports collaboratifs doivent obligatoirement franchir ces points de contrôle.

## Protection des clés par le système d'exploitation

Astraea s'interface avec les gestionnaires de sécurité de l'OS lorsqu'ils sont disponibles :

- **Windows :** DPAPI / Gestionnaire d'identifiants Windows
- **macOS :** Trousseau d'accès (Keychain), avec enclave matérielle sécurisée lorsque la machine le permet
- **Linux :** Secret Service / trousseaux conformes à libsecret selon la distribution

La sécurisation sur puce matérielle dépend des capacités de la machine et n'est pas présumée sur tous les postes.

## Éléments de preuve et d'audit (Security Evidence)

Les publications officielles s'accompagnent d'éléments de traçabilité incontestables :

- Inventaire complet des composants tiers et licences associées ;
- Nomenclature logicielle au format SPDX (SBOM) ;
- Empreintes cryptographiques de version (SHA-256) ;
- Manifeste de publication revêtu d'une signature numérique ;
- Données de provenance de build issues de la chaîne de compilation sécurisée.

L'ensemble des artéfacts accompagnant une version fait seul autorité.

---

# Architecture technique

Astraea conjugue un moteur robuste en Rust, un conteneur d'application bureau Tauri v2 et une interface en React 19 et TypeScript.

```text
┌─────────────────────────────────────────────────────────────┐
│                    Astraea Desktop Shell                    │
│                         Tauri v2                            │
│                                                             │
│  ┌───────────────────────────────────────────────────────┐  │
│  │              React / TypeScript UI                   │  │
│  │                                                       │  │
│  │  Workspace Shell · Explorer · Éditeurs · Paramètres   │  │
│  │  Guides · Recherche · Objets Transversaux             │  │
│  └─────────────────────────┬─────────────────────────────┘  │
│                            │ IPC typée                      │
│  ┌─────────────────────────▼─────────────────────────────┐  │
│  │                    Rust Core                          │  │
│  │                                                       │  │
│  │  WOM · VWC · Recherche · Règles · Interop · Secours   │  │
│  │  Crypto · Automates · NetGate · Intégration Native    │  │
│  └─────────────────────────┬─────────────────────────────┘  │
└────────────────────────────┼────────────────────────────────┘
                             │
               OS natif / stockage local /
               trousseaux de clés OS / connecteurs explicites
```

### Pourquoi Tauri ?

Tauri mobilise la WebView native du système d'exploitation au lieu d'embarquer un navigateur Chromium dédié pour chaque application. Cela limite considérablement le volume de téléchargement et la consommation en ressources, tout en préservant la vélocité et la fiabilité d'un noyau en Rust.

Pour en savoir plus sur l'architecture officielle de Tauri :  
https://tauri.app/concept/architecture/

### Stratégie de développement interne direct (First-Party)

Astraea maintient intentionnellement la maîtrise directe de ses sous-ensembles fondamentaux :

- Modèle d'objets du workspace (WOM)
- Éditeurs bureautiques intégrés
- Sémantique documentaire et système de références croisées
- Intégration de l'index de recherche local
- Moteur de règles (Policy Engine)
- Environnement d'exécution des automatisations
- Passerelles d'interopérabilité
- Conteneurs chiffrés locaux
- Intégration du **VGT Infinity Cryptographic Core** pour les besoins cryptographiques avancés

Les dépendances extérieures sont réservées aux cas où l'ingénierie le justifie pleinement, à savoir les primitives cryptographiques auditées de référence, le dialogue avec l'OS et certains modules de rendu circonscrits.

L'arbre complet des bibliothèques logicielles figure dans le SBOM généré, et non dans des argumentaires publicitaires.

---

# Performances et consommation de ressources

Astraea a été pensé pour éliminer les surcoûts d'exécution superflus.

En s'appuyant sur la WebView native, Astraea n'embarque pas une instance Chromium distincte comme le font couramment les applications Electron. Cet arbitrage technique diminue l'empreinte globale, bien que la mémoire vive réellement consommée varie selon le système d'exploitation, le volume de documents ouverts, les prévisualisations, l'indexation de recherche et les applications en cours d'exécution.

## Mesures constatées sur les versions préliminaires

Sur le poste de test de référence sous Windows, nos évaluations internes ont relevé approximativement :

**~100–150 Mo de RAM au repos (idle) sans document de travail ouvert**

Cette donnée constitue une **mesure interne constatée en pré-lancement** et non un engagement formel absolu. Les mesures finales seront publiées avec indication précise du système, de la version de WebView, de la charge documentaire et du protocole de mesure.

## Pourquoi nous refusons de publier des chiffres comparatifs biaisés

Établir des comparaisons de mémoire vive entre suites bureautiques est souvent trompeur.

Une fenêtre Microsoft Word vide, un onglet Google Docs dans un navigateur, LibreOffice exécutant un module Base sous Java ou un éditeur multi-processus correspondent à des charges logicielles hétérogènes.

C'est pourquoi le tableau ci-après mentionne les **exigences matérielles officielles des éditeurs**, et non des comparatifs de veille artificielle :

| Produit | Mémoire vive requise officielle / Référence | Fonctionnement bureautique hors-ligne | Source |
|---|---:|:---:|---|
| **Astraea Workspace** | Mesure interne préliminaire : ~100–150 Mo au repos ; 4 Go de mémoire conseillés pour un usage fluide | ✅ | Mesures internes VGT |
| **Microsoft 365 Apps** | 4 Go de mémoire sous les prérequis actuels Windows / macOS | ✅ Applications de bureau | [Microsoft](https://support.microsoft.com/fr-fr/office/configuration-requise-pour-microsoft-365-pour-les-particuliers-71423642-bbbb-4811-93e3-add3ff2d3192) |
| **LibreOffice** | 256 Mo de RAM minimum, 512 Mo recommandés sous Windows/Linux | ✅ | [LibreOffice](https://fr.libreoffice.org/get-help/system-requirements/) |
| **ONLYOFFICE Desktop Editors** | 2 Go de mémoire ou plus | ✅ | [ONLYOFFICE](https://helpcenter.onlyoffice.com/fr/desktop/installation/desktop-sys-reqs-windows.aspx) |
| **Google Docs / Sheets / Slides** | Selon le navigateur ; aucune valeur de bureau autonome comparable | ⚠️ Mode hors-ligne disponible après configuration | [Google](https://support.google.com/docs/answer/6388102?hl=fr) |

> **Remarque :** la mémoire vive minimale requise par un système et l'espace mémoire actif (working set) d'une application représentent des indicateurs distincts. Le tableau est fourni à titre indicatif sans assimilation abusive.

Tout test d'évaluation reproductible d'Astraea doit renseigner au minimum :

```text
Démarrage à froid (Cold launch)
Mémoire au repos après stabilisation
Charge avec document Writer
Charge de calcul sur Grid
Charge de documents PDF
État de l'index de recherche locale
Working set de crête (Peak)
Working set privé
Usage processeur au repos
Système d'exploitation / WebView / empreinte du build
```

---

# Comparatif équitable avec les autres suites de productivité

Astraea n'a nul besoin d'allégations erronées sur les solutions concurrentes pour valoriser son modèle.

Les applications de bureau Microsoft 365 savent enregistrer des fichiers en local ou sur OneDrive / SharePoint. Google Docs, Sheets et Slides proposent un mode hors-connexion une fois paramétrés. LibreOffice et ONLYOFFICE Desktop Editors manipulent par défaut des fichiers locaux sans dépendance réseau.

La singularité d'Astraea ne tient donc pas simplement à la formule "les autres imposent le cloud".

Elle réside dans la **conjonction** d'une souveraineté locale des données, d'un modèle d'objets partagé, de règles réseau formelles, de conteneurs chiffrés natifs, d'une version Open Core libre et d'une ergonomie transversale unifiant bureautique, savoir, sécurité et automatisation.

| Critère | Astraea Workspace | Microsoft 365 | Google Workspace | LibreOffice | ONLYOFFICE Desktop |
|---|---|---|---|---|---|
| **Modèle fondamental** | Espace bureautique local-first | Applications poste + cloud | Suite web orientée cloud | Suite bureautique locale | Suite locale + cloud optionnel |
| **Flux de fichiers en local** | ✅ Natif et central | ✅ Pris en charge | ⚠️ Mode déconnecté partiel | ✅ | ✅ |
| **Compte distant requis pour éditer en local** | Non | Selon formule/licence | Service lié à un compte | Non | Non |
| **Socle de bureau open source** | ✅ Open Core, AGPLv3 | Non | Non | ✅ MPLv2 | ✅ AGPLv3 |
| **Modèle d'objets transversal Astraea** | ✅ WOM | Architecture distincte | Architecture distincte | Architecture distincte | Architecture distincte |
| **Conteneurs chiffrés Astraea** | ✅ | Architecture distincte | Architecture distincte | Architecture distincte | Architecture distincte |
| **Zéro télémétrie par conception Astraea** | ✅ | Selon politique éditeur | Selon politique éditeur | Selon communauté | Selon politique éditeur |
| **Extension collaborative d'entreprise** | ✅ Premium | ✅ | ✅ | Écosystème tiers | ✅ |

Références officielles retenues pour l'analyse :

- Enregistrement local et cloud chez Microsoft : https://support.microsoft.com/fr-fr/office/enregistrer-des-fichiers-dans-microsoft-365-70da744d-0f4d-472e-9f6d-b6480b556942
- Utilisation hors-connexion chez Google : https://support.google.com/docs/answer/6388102?hl=fr
- Configuration requise LibreOffice : https://fr.libreoffice.org/get-help/system-requirements/
- Utilisation hors-ligne d'ONLYOFFICE Desktop : https://helpcenter.onlyoffice.com/fr/desktop/getting-started.aspx

---

# Les 20 applications intégrées

## Bureautique et mise en page

### Astraea Writer — `.vdoc`
Traitement de texte professionnel, styles, typographie, tableaux, gestion documentaire structurée et formats d'échange.

### Astraea Grid — `.vgrid`
Tableur complet, modélisation mathématique, analyses, graphiques et traitement tabulaire haute performance.

### Astraea Present — `.vpresent`
Conception de présentations, diapositives vectorielles, intégration de médias et interface conférencier.

### Astraea Publish — `.vpub`
Publication assistée par ordinateur pour la réalisation de catalogues, plaquettes, revues et documents destinés au prépresse.

## Connaissances, réflexion et création

### Astraea Notes — `.vnote`
Gestion personnelle des connaissances (PKM), fiches interconnectées, support Markdown et cartographie d'idées.

### Astraea Whiteboard — `.vboard`
Tableau blanc sans limite, schémas, cartes mentales, organisation visuelle et intégration d'objets dynamiques.

### Astraea Draw — `.vdraw`
Dessin vectoriel, calques, courbes de Bézier et bibliothèque d'éléments SVG.

### Astraea PDF Studio — `.vpdf`
Consultation et traitement de documents PDF incluant annotations, signatures et caviardage certifié.

## Tâches, pilotage et mise en œuvre

### Astraea Tasks — `.vtask`
Suivi des tâches individuelles, récurrences, priorités, sous-tâches et rattachement aux éléments de travail.

### Astraea Planner — `.vplan` — Premium
Tableaux Kanban, équilibrage des charges de travail, planification temporelle et coordination de groupe.

### Astraea Projects — `.vproj` — Premium
Phasage de projets, jalons clés, chemin critique (Gantt) et gestion prévisionnelle des risques.

## Données, formulaires et indicateurs

### Astraea Forms — `.vform` — Premium
Création de questionnaires et formulaires dynamiques avec logique conditionnelle et consolidation des réponses.

### Astraea Database — `.vdb` — Premium
Modèles de données relationnels no-code avec typage strict et vues intégrées dans le workspace.

### Astraea Insight — `.vinsight`
Tableaux de bord opérationnels, indicateurs d'activité (KPI) et synthèse analytique locale.

## Sécurité, automatisation et échanges

### Astraea Vault — `.vvault`
Coffre-fort chiffré pour clés d'accès, pièces protégées et documents hautement sensibles.

### Astraea Spaces — `.vspace` — Premium
Espaces collaboratifs dédiés aux équipes, gestion fine des rôles et contextes de sécurité.

### Astraea Connect — `.vconnect`
Passerelles d'intégration externe cloisonnées avec filtrage strict des connexions.

### Astraea Automate — `.vauto`
Orchestration et automatisation locale et déterministe de flux de travail.

### Astraea Admin & Policy — `.vpolicy`
Administration de la sécurité, configuration des stratégies et paramétrage adapté à l'édition installée.

### Astraea GaiaCom — `.vgcom` — Premium
Messagerie chiffrée de bout en bout et synchronisation en maillage pour environnements coopératifs.

---

# Modèle tarifaire et licences

## Open Core

| Édition | Tarif | Licence | Validité |
|---|---:|---|---|
| **Astraea Open Core** | **0 €** | **GNU AGPLv3** | Libre pour toujours |

L'édition Open Core n'expire jamais et ne requiert aucune souscription.

## Licences commerciales Premium prévues

Astraea Premium est proposé sous la forme d'une **licence commerciale perpétuelle**, sans abonnement périodique obligatoire.

| Formule | Période de disponibilité | Tarif unique prévu | Mise à niveau majeure prévue |
|---|---:|---:|---:|
| **Premium Beta Early-Bird** | Nov 2026 – Fév 2027 | **39,99 €** | **~45,99 €** |
| **Premium Standard** | À partir de mars 2027 | **69,00 €** | **~45,99 €** |
| **Éducation & ONG** | Structures éligibles | **36,99 €** | **9,99 €** |

> [!NOTE]
> L'édition Premium n'est pas encore mise en vente. Les conditions présentées reflètent nos orientations actuelles et ont un caractère informatif jusqu'à l'ouverture publique du service d'achat et de gestion des licences.

---

# Installation

## Exécutables publics précompilés

Les assistants d'installation et paquets binaires officiels seront mis à disposition dans la section **GitHub Releases** dès validation des jalons de publication.

Systèmes d'exploitation cibles :

```text
Windows
macOS
Linux
```

La date de disponibilité effective peut varier selon les plateformes en fonction de la validation de leurs contrôles spécifiques.

## Compilation depuis les sources

### Prérequis

- Node.js 20 LTS ou 22 LTS
- Rust / Cargo
- Outil en ligne de commande Tauri v2
- Composants de compilation requis par Tauri selon le système hôte

### Interface utilisateur (UI)

```bash
cd ui
npm ci
npm run typecheck
npm run build
```

### Conteneur de bureau

```bash
cd crates/vgt-desktop
cargo tauri dev
```

Génération du paquet final de production :

```bash
cargo tauri build
```

> Les commandes de build et versions de dépendances doivent être conformes aux fichiers de verrouillage du dépôt et à la documentation de livraison en vigueur si elles divergent des syntaxes illustratives ci-dessus.

---

# Configuration système requise

Recommandations actuelles :

- **Mémoire vive :** 4 Go de RAM au minimum ; 8 Go conseillés pour des flux multi-fichiers exigeants
- **Espace disque :** La taille d'installation finale sera précisée lors de la publication de l'archive officielle
- **Affichage :** Écran de bureau actuel ; l'interface intègre la mise à l'échelle pour l'accessibilité
- **Réseau :** Connexion non requise pour les travaux de base ; nécessaire uniquement pour les modules externes, synchronisations ou mises à jour demandés par l'utilisateur

Les versions minimales détaillées des systèmes d'exploitation seront indiquées avec les artéfacts finaux.

---

# État de préparation à la publication (Release Readiness)

Le schéma directeur de réalisation du moteur a atteint le score de :

```text
3334 / 3334
```

Cette valeur témoigne de l'accomplissement exhaustif de la feuille de route d'implémentation du noyau.

Elle **n'équivaut pas** pour autant à une diffusion publique effective et stabilisée.

La phase préparatoire de bêta publique comprend des contrôles d'homologation dédiés :

```text
Scission matérielle des arborescences des deux éditions
Étanchéité fonctionnelle entre Open Core et Premium
Workspace Explorer / Library unifié
Transfert et glisser-déposer d'objets entre applications
Refonte approfondie de la charte ergonomique
Homogénéité des thèmes sur l'ensemble des écrans
Didacticiels interactifs
Raccordement des paramètres persistants
Localisation et internationalisation
Accessibilité numérique
Constitution des éléments de preuve de sécurité
Validation des cycles d'usage intégraux (roundtrips)
Tests de non-régression import / export
Comportements de reprise sur incident
Optimisation des performances
Chaîne de fabrication des installeurs
Génération des SBOM / signatures / métadonnées de build
Contrôle des anomalies visuelles avant mise à disposition
```

Le dépôt ne passera de l'état **Pre-Release** au statut **Beta** qu'une fois ces exigences formellement attestées par les artéfacts de l'arborescence finale.

---

# Documentation

Documentation technique et de présentation disponible :

| Document | Langue | Catégorie |
|---|:---:|---|
| [What is Astraea Workspace?](./01_Astraea_Workspace_What_It_Is_EN.pdf) | Anglais | Produit / concept |
| [Premium Security & Sovereignty](./02_Astraea_Workspace_Premium_Security_Sovereignty_EN.pdf) | Anglais | Livre blanc technique |
| [Was ist Astraea Workspace?](./01_Astraea_Workspace_Was_es_ist_DE.pdf) | Allemand | Produit / concept |
| [Premium Sicherheit & Souveränität](./02_Astraea_Workspace_Premium_Sicherheit_Souveraenitaet_DE.pdf) | Allemand | Livre blanc technique |
| [Produktivität & Datenfluss](./03_Astraea_Workspace_Premium_Produktivitaet_Datenfluss_DE.pdf) | Allemand | Architecture produit |
| [Che cos'è Astraea Workspace?](./01_Astraea_Workspace_Che_Cose_IT.pdf) | Italien | Produit / concept |
| [Sicurezza Premium & Sovranità](./02_Astraea_Workspace_Premium_Sicurezza_Sovranita_IT.pdf) | Italien | Livre blanc technique |
| [¿Qué es Astraea Workspace?](./01_Astraea_Workspace_Que_Es_ES.pdf) | Espagnol | Produit / concept |
| [Seguridad Premium & Soberanía](./02_Astraea_Workspace_Premium_Seguridad_Soberania_ES.pdf) | Espagnol | Livre blanc technique |
| [Qu'est-ce qu'Astraea Workspace ?](./01_Astraea_Workspace_Ce_Que_Cest_FR.pdf) | Français | Produit / concept |
| [Sécurité Premium & Souveraineté](./02_Astraea_Workspace_Premium_Securite_Souverainete_FR.pdf) | Français | Livre blanc technique |
| [Что такое Astraea Workspace?](./01_Astraea_Workspace_What_It_Is_RU.pdf) | Russe | Produit / concept |
| [Премиальная безопасность и суверенитет](./02_Astraea_Workspace_Premium_Security_Sovereignty_RU.pdf) | Russe | Livre blanc technique |

---

# Intégrité de la chaîne logicielle (Supply Chain)

Le modèle de diffusion d'Astraea est conçu pour permettre l'inspection minutieuse des exécutables distribués :

Les attestations officielles comprendront, dans le cadre de la chaîne de publication :

```text
Inventaire des modules et licences d'exploitation
Fichier SPDX SBOM
Empreintes de contrôle SHA-256
Bordereau de publication certifié par signature numérique
Informations de traçabilité des compilations (provenance)
```

Ces artéfacts automatisés constituent l'unique référence opposable pour les versions de bibliothèques.

Ce document évite délibérément de conserver une liste statique manuscrite sujette à des divergences vis-à-vis des fichiers `Cargo.lock`, `package-lock.json`, `go.sum` et du SBOM réel.

---

# Licence

**Astraea Workspace Open Core est distribué sous licence GNU Affero General Public License v3.0 (AGPL-3.0).**

Consulter :

- [`LICENSE`](./LICENSE)
- [`NOTICE`](./NOTICE), s'il est présent
- Les mentions spécifiques aux bibliothèques embarquées et le SBOM de publication

Astraea Premium est concédé séparément sous licence commerciale propriétaire.

---

# Vision

L'informatique doit donner aux femmes et aux hommes le pouvoir d'écrire, de concevoir, d'analyser et de coopérer sans leur imposer de renoncer à la propriété de leur cadre de travail.

Astraea Workspace a été édifié sur cette conviction :

**local quand la proximité suffit, connecté de façon explicite lorsque l'échange le réclame, libre là où s'applique la promesse Open Core, et intrinsèquement interopérable sur tout l'espace de travail plutôt qu'émietté en logiciels étanches.**

<p align="center">
  <strong>Astraea Workspace</strong><br>
  <em>Your Mind. Your Work. Your Sovereignty.</em><br><br>
  <sub>© 2026 VisionGaiaTechnology · Open Core sous licence AGPL-3.0</sub>
</p>
