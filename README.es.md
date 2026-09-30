<p align="center">
  <img src="./astraeaworkspace1.png" alt="Astraea Workspace" width="680"/>
</p>

<p align="center">
  <a href="./README.md">English</a> ·
  <a href="./README.de.md">Deutsch</a> ·
  <a href="./README.it.md">Italiano</a> ·
  <b>Español</b> ·
  <a href="./README.fr.md">Français</a> ·
  <a href="./README.ru.md">Русский</a>
</p>

<p align="center">
  <strong>Un espacio de trabajo productivo, soberano y local, diseñado para la propiedad absoluta de los datos.</strong><br>
  <em>Local-first · Cero telemetría de producto por diseño · Contenedores cifrados autenticados · Seguridad preparada para la era poscuántica · Open Core</em>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Status-Public%20Beta%20Pre--Release-FFB300?style=for-the-badge" alt="Public Beta Pre-Release"/>
  <img src="https://img.shields.io/badge/Core%20Hito-3334%2F3334-00C853?style=for-the-badge&logo=checkmarx&logoColor=white" alt="Core hito 3334/3334"/>
  <img src="https://img.shields.io/badge/Core-Rust%202021-DEA584?style=for-the-badge&logo=rust&logoColor=white" alt="Rust Core"/>
  <img src="https://img.shields.io/badge/Shell-Tauri%20v2-24C8D8?style=for-the-badge&logo=tauri&logoColor=white" alt="Tauri v2"/>
  <img src="https://img.shields.io/badge/UI-React%2019%20%7C%20TypeScript-61DAFB?style=for-the-badge&logo=react&logoColor=black" alt="React y TypeScript"/>
  <img src="https://img.shields.io/badge/Licencia-AGPLv3-00B0FF?style=for-the-badge" alt="AGPLv3"/>
</p>

---

> [!IMPORTANT]
> ## Estado del lanzamiento público
>
> **Astraea Workspace se encuentra en su fase final de endurecimiento previa al lanzamiento.**
>
> El hito de implementación del núcleo está completo. La fase actual se centra en la separación de ediciones, verificación de flujos de trabajo de extremo a extremo, Workspace Explorer, coherencia de diseño, accesibilidad, localización, evidencias de seguridad, empaquetado y pruebas de regresión finales.
>
> Los paquetes oficiales de distribución se publicarán únicamente tras superar los controles de calidad (release gates). Hasta entonces, un hito de lista de control interna no debe confundirse con una versión pública lanzada y verificada.

---

## ¿Qué es Astraea Workspace?

Astraea Workspace es una suite de productividad de escritorio diseñada en torno a un principio elemental:

**Tu trabajo debe seguir siendo utilizable, comprensible y estar bajo tu control incluso cuando no haya ningún servicio en la nube disponible.**

Combina edición ofimática, gestión del conocimiento, herramientas creativas, automatización, búsqueda local, almacenamiento cifrado y objetos de trabajo transversales dentro de un único entorno de escritorio.

Los flujos de trabajo principales son **local-first**. Las funciones de red son capacidades explícitas y no un requisito para abrir o editar tus documentos.

Astraea no es una simple colección de editores inconexos con un nuevo diseño exterior. Sus aplicaciones comparten un **Workspace Object Model (WOM)** unificado, de modo que los objetos compatibles puedan referenciarse, incrustarse, buscarse, automatizarse y reutilizarse en toda la suite.

### Principios del producto

- **Local-first por defecto** — los documentos y el estado del espacio de trabajo permanecen locales a menos que el usuario active deliberadamente una función de red.
- **Cero telemetría de producto por diseño** — no se requiere ninguna infraestructura de análisis de comportamiento para el funcionamiento normal del espacio de trabajo.
- **Capacidad offline y air-gap** — los flujos de trabajo fundamentales están diseñados para operar sin cuenta en la nube ni conexión permanente a Internet.
- **Open Core, libre para siempre** — Astraea Open Core está bajo licencia GNU AGPLv3 y constituye la base permanentemente gratuita del producto.
- **Límite explícito de Premium** — Premium añade organización, datos empresariales estructurados, planificación, espacios y colaboración cifrada. No existe para hacer que la edición gratuita sea intencionadamente incompleta.
- **Objetos transversales entre aplicaciones** — Writer, Grid, Whiteboard, Publish, Insight, Automate y las demás aplicaciones pueden compartir objetos compatibles en lugar de forzar todo mediante copiar y pegar.
- **Seguridad descrita por controles concretos** — las primitivas criptográficas, la gestión de claves, las políticas de red y las evidencias de lanzamiento se documentan directamente sin recurrir a etiquetas de marketing ambiguas.

---

# Ediciones

## Astraea Open Core — Libre para siempre

Astraea Open Core es la base para la productividad personal de la plataforma.

Es **software libre y de código abierto bajo GNU AGPLv3**.

Las aplicaciones incluidas en Open Core permanecerán integradas en la edición gratuita. Los desarrollos futuros de Premium podrán incorporar nuevas capacidades organizativas, pero el propósito de Open Core es mantenerse como un producto real y completo, no como una demostración temporal.

## Astraea Premium — Organización, datos y colaboración

Astraea Premium es el superconjunto comercial.

Incluye todo el contenido de Open Core y añade las seis aplicaciones orientadas a la ejecución de proyectos, datos empresariales estructurados, espacios de equipo y colaboración cifrada multidispositivo.

> **Open Core es la oficina personal soberana. Premium conecta la organización a su alrededor.**

### Matriz de ediciones

| Aplicación | Open Core | Premium | Formato | Función principal |
|---|:---:|:---:|:---:|---|
| **Astraea Writer** | ✅ | ✅ | `.vdoc` | Procesamiento de textos, documentos estructurados, tablas, referencias y exportación |
| **Astraea Grid** | ✅ | ✅ | `.vgrid` | Hojas de cálculo multilibro, fórmulas, análisis y gráficos |
| **Astraea Present** | ✅ | ✅ | `.vpresent` | Presentaciones con diapositivas, escenas, medios y flujos de ponente |
| **Astraea Notes** | ✅ | ✅ | `.vnote` | Notas, gestión del conocimiento personal (PKM) y conocimiento vinculado |
| **Astraea PDF Studio** | ✅ | ✅ | `.vpdf` | Visualización de PDF, anotaciones, firmas y flujos de redacción/censura |
| **Astraea Tasks** | ✅ | ✅ | `.vtask` | Gestión de tareas personales, recurrencia, prioridades y enlaces al espacio de trabajo |
| **Astraea Whiteboard** | ✅ | ✅ | `.vboard` | Lienzo infinito, diagramas, mapas mentales y objetos de trabajo en vivo |
| **Astraea Vault** | ✅ | ✅ | `.vvault` | Credenciales cifradas, archivos protegidos y datos sensibles |
| **Astraea Draw** | ✅ | ✅ | `.vdraw` | Dibujo vectorial, gráficos por capas y flujos de trabajo SVG |
| **Astraea Publish** | ✅ | ✅ | `.vpub` | Autoedición (DTP) para maquetación editorial estructurada y salida impresa |
| **Astraea Insight** | ✅ | ✅ | `.vinsight` | Paneles locales de control, métricas y vistas analíticas |
| **Astraea Connect** | ✅ | ✅ | `.vconnect` | Integraciones externas protegidas y límites definidos de conexión |
| **Astraea Automate** | ✅ | ✅ | `.vauto` | Automatización determinista y local de flujos de trabajo |
| **Astraea Admin & Policy** | ✅* | ✅ | `.vpolicy` | Políticas locales, administración y configuración relevante para la seguridad |
| **Astraea Projects** | 🔒 | ✅ | `.vproj` | Proyectos, fases, dependencias, diagramas de Gantt y planificación de riesgos |
| **Astraea Planner** | 🔒 | ✅ | `.vplan` | Tableros Kanban, carga de trabajo, calendario y planificación colaborativa |
| **Astraea Database** | 🔒 | ✅ | `.vdb` | Modelos de datos relacionales sin código tipizados y vistas integradas |
| **Astraea Forms** | 🔒 | ✅ | `.vform` | Diseño de formularios y encuestas, flujos condicionales y respuestas estructuradas |
| **Astraea Spaces** | 🔒 | ✅ | `.vspace` | Espacios de equipo, roles, contexto de políticas y fronteras organizativas |
| **Astraea GaiaCom** | 🔒 | ✅ | `.vgcom` | Comunicación cifrada, sincronización mesh y transporte de colaboración |

\* Open Core incluye las interfaces de administración y políticas correspondientes a la propia edición Open Core. Las funciones de políticas operativas exclusivas de Premium se mantienen en Premium.

### Superficies de plataforma compartidas

Las siguientes características son componentes de la plataforma del espacio de trabajo y no aplicaciones independientes de pago:

- **Workspace Explorer / Library** — descubrir, organizar, previsualizar y reutilizar documentos existentes.
- **Búsqueda** — búsqueda local integrada entre aplicaciones.
- **Configuración** — preferencias reales y persistidas del espacio de trabajo y de las aplicaciones.
- **Guías** — tutoriales interactivos de primer inicio y guías por aplicación.
- **Recuperación / Diagnóstico** — interfaces locales de recuperación y resolución de incidencias.
- **Paleta de comandos y navegación shell** — plano de control unificado del espacio de trabajo.

---

# Workspace Explorer

Astraea Workspace incluye un **Workspace Explorer** centralizado para que los usuarios no necesiten recordar qué aplicación tiene abierto un documento antes de reutilizarlo.

El Explorer permite encontrar el trabajo guardado en toda la suite:

```text
Todos los archivos
Recientes
Abiertos
Favoritos
Colecciones
Búsqueda
Vista previa
Abrir origen
Insertar desde Workspace
Arrastrar y soltar (Drag & Drop)
```

La distinción esencial es semántica.

Un archivo `.vgrid` arrastrado dentro de Writer no se procesa como un archivo binario genérico. Astraea ofrece las operaciones apropiadas para ese origen y destino:

```text
Rango en vivo (Live range)
Instantánea fija (Frozen snapshot)
Copiar como tabla de Writer
Abrir origen
```

El mismo modelo admite objetos compatibles entre Writer, Grid, Present, Whiteboard, Publish, Insight, Automate y las demás aplicaciones del entorno.

---

# Local-first no significa aislado

Astraea está concebido para trabajar en local de forma prioritaria, pero local-first no es equivalente a "no comunicarse nunca".

Open Core conserva toda su utilidad sin necesidad de una cuenta en la nube.

Premium puede incorporar sincronización cifrada, espacios y colaboración GaiaCom cuando el usuario o la organización los habiliten expresamente.

Las funciones con capacidad de red permanecen delimitadas por políticas y no alteran el modelo de propiedad de los documentos locales.

---

# Arquitectura de seguridad

Astraea Workspace sigue un diseño de **computación local bajo el modelo Zero-Trust**.

El proyecto documenta mecanismos concretos de seguridad en lugar de utilizar afirmaciones indefinidas como "seguridad de grado militar".

## Contenedores cifrados VWC

Los documentos nativos del espacio de trabajo se almacenan mediante la arquitectura de contenedores de Astraea.

Los controles destacados incluyen:

- Cifrado autenticado utilizando esquemas AEAD modernos como **AES-256-GCM** y **ChaCha20-Poly1305**, donde sea aplicable;
- **Argon2id** para la derivación de claves basada en contraseñas, cuando se utilice una frase de paso en la cadena de claves;
- Verificaciones de integridad y autenticación sobre los datos del contenedor;
- Análisis sintáctico y validación acotados en los límites de confianza de los archivos;
- Versionado explícito y rutas de migración definidas.

Los algoritmos y perfiles exactos son detalles de implementación documentados en la arquitectura y en las evidencias de lanzamiento, sin reducirlos a reclamos comerciales.

## VGT Infinity Cryptographic Core

Astraea Workspace integra el **VGT Infinity Cryptographic Core** como un subsistema de seguridad nativo de primera parte.

En la arquitectura actual del repositorio, Infinity reside en:

```text
vendor/infinity
```

y proporciona los componentes criptográficos avanzados empleados por los perfiles de seguridad de Astraea, tales como:

- Perfiles híbridos clásicos / poscuánticos para el intercambio de claves;
- Compatibilidad estandarizada con **ML-KEM** en los perfiles correspondientes;
- **ML-DSA** y primitivas de firma adicionales en los perfiles compatibles;
- Construcciones de cifrado simétrico autenticado;
- Perfiles compuestos de alta seguridad capaces de combinar múltiples primitivas independientes;
- Separación explícita de claves, verificación de integridad y gestión de memoria protegida implementadas por el subsistema Infinity;
- Aislamiento del proveedor criptográfico cuando una primitiva se proporciona mediante un límite delimitado de proveedor/sidecar.

La integración actual de Infinity en el repositorio contiene perfiles poscuánticos y compuestos especializados más allá de la línea base mínima ML-KEM / ML-DSA. Los algoritmos activados, versiones de proveedores y la composición de perfiles se tratan como **hechos comprobados en el lanzamiento**: el SBOM final, los archivos de bloqueo, el documento de arquitectura y el manifiesto de versión son la fuente autorizada para cada compilación.

Esta distinción es esencial: Astraea no afirma que apilar algoritmos cree una seguridad mágica o matemáticamente irrompible. Infinity se utiliza como una capa criptográfica nativa adicional cuyos perfiles se seleccionan y verifican explícitamente.

## Soporte poscuántico

Mediante la integración de Infinity y la pila de seguridad nativa de Astraea, el espacio de trabajo admite componentes criptográficos aptos para la era poscuántica, incluidas las familias estandarizadas **ML-KEM** y **ML-DSA** en los perfiles aplicables.

La criptografía poscuántica reduce riesgos criptográficos específicos a largo plazo; **no** se presenta como una garantía absoluta frente a cualquier amenaza futura.

## NetGate

El acceso a la red se articula mediante políticas explícitas en lugar de una salida libre por defecto.

Donde aplique la política de NetGate, el tráfico saliente se gestiona mediante listas blancas y puede denegarse antes de cualquier comunicación a nivel de aplicación. Los conectores y transportes de colaboración deben superar los límites de política fijados.

## Protección de claves respaldada por el sistema operativo

Astraea se integra con los servicios de protección de credenciales del sistema operativo cuando están disponibles:

- **Windows:** DPAPI / Administrador de credenciales de Windows
- **macOS:** Servicios de llavero (Keychain), con respaldo por hardware donde lo admita el equipo y su configuración
- **Linux:** Secret Service / almacenes compatibles con libsecret según disponibilidad

La protección por hardware depende de las prestaciones del equipo y no se asume en todos los sistemas.

## Evidencias de seguridad (Security Evidence)

Las versiones oficiales se entregan acompañadas de artefactos de verificación:

- Inventario de dependencias y licencias;
- SPDX SBOM;
- Hashes de la versión (SHA-256);
- Manifiesto de lanzamiento firmado;
- Evidencias de trazabilidad y compilación (provenance) generadas en la canalización de lanzamiento.

El conjunto de artefactos publicado con una versión es la fuente vinculante para dicha entrega.

---

# Arquitectura

Astraea combina un núcleo en Rust con una interfaz de escritorio en Tauri y una experiencia de usuario en React y TypeScript.

```text
┌─────────────────────────────────────────────────────────────┐
│                    Astraea Desktop Shell                    │
│                         Tauri v2                            │
│                                                             │
│  ┌───────────────────────────────────────────────────────┐  │
│  │              React / TypeScript UI                   │  │
│  │                                                       │  │
│  │  Workspace Shell · Explorer · Editores · Config.     │  │
│  │  Guías · Búsqueda · Superficies de Objetos Cruzados   │  │
│  └─────────────────────────┬─────────────────────────────┘  │
│                            │ IPC tipificada                 │
│  ┌─────────────────────────▼─────────────────────────────┐  │
│  │                    Rust Core                          │  │
│  │                                                       │  │
│  │  WOM · VWC · Búsqueda · Policy · Interop · Recuper.  │  │
│  │  Crypto · Automatización · NetGate · Integr. Nativa  │  │
│  └─────────────────────────┬─────────────────────────────┘  │
└────────────────────────────┼────────────────────────────────┘
                             │
                SO nativo / almacenamiento local /
                almacenes de claves del SO / conectores
```

### ¿Por qué Tauri?

Tauri aprovecha la WebView del sistema operativo en lugar de empaquetar un entorno de navegación completo e independiente con cada aplicación. Esto minimiza el tamaño de descarga a la vez que preserva un núcleo de aplicación nativo y robusto en Rust.

Consulta la documentación técnica oficial de Tauri:  
https://tauri.app/concept/architecture/

### Estrategia de control nativo (First-Party)

Astraea mantiene intencionadamente bajo control directo los aspectos críticos del espacio de trabajo:

- Workspace Object Model
- Editores del espacio de trabajo
- Semántica de documentos y referencias
- Integración de búsqueda local
- Motor de políticas (Policy Engine)
- Entorno de ejecución de automatizaciones
- Orquestación de interoperabilidad
- Contenedores cifrados del espacio de trabajo
- Integración de **VGT Infinity Cryptographic Core** para perfiles de seguridad avanzados

Se recurre a bibliotecas externas cuando representan la mejor decisión de ingeniería, especialmente para primitivas criptográficas auditadas, integración con el sistema operativo y componentes de renderizado delimitados.

El árbol de dependencias exacto corresponde al SBOM generado y no a textos descriptivos de marketing.

---

# Rendimiento y uso de recursos

Astraea está concebido para prescindir de duplicidades innecesarias en tiempo de ejecución.

El uso de la WebView del sistema por parte de Tauri implica que Astraea no empaqueta un Chromium independiente como suele ocurrir en aplicaciones convencionales de Electron. Esta decisión reduce la sobrecarga de empaquetado y consumo de procesos, si bien el uso efectivo de memoria dependerá del sistema operativo, documentos abiertos, versión de WebView, previsualizaciones, índices de búsqueda y aplicaciones en uso.

## Observación actual previa al lanzamiento

En la compilación de referencia previa para Windows, las pruebas internas registraron aproximadamente:

**~100–150 MB de memoria RAM en reposo (idle) sin documentos de trabajo abiertos**

Este dato representa una **medición interna previa al lanzamiento** y no una garantía invariable. Las mediciones definitivas se publicarán especificando sistema operativo, compilación, versión de WebView, estado de los documentos y metodología aplicada.

## Por qué no publicamos cifras engañosas de RAM de la competencia

Comparar la memoria RAM entre distintas suites ofimáticas puede inducir a error con facilidad.

Microsoft Word con un documento en blanco, un navegador con Google Docs, LibreOffice con Base (Java) y un editor de escritorio multiproceso suponen cargas de trabajo heterogéneas.

Por esta razón, la siguiente tabla recoge los **requisitos de sistema oficiales publicados por los fabricantes**, no comparativas artificiales de consumo en reposo:

| Producto | Requisito de memoria oficial / Referencia | Funcionamiento de escritorio offline | Fuente |
|---|---:|:---:|---|
| **Astraea Workspace** | Medición interna pre-lanzamiento: ~100–150 MB en reposo; se recomiendan 4 GB de RAM para un uso fluido | ✅ | Medición interna VGT |
| **Microsoft 365 Apps** | 4 GB de RAM según requisitos actuales de Windows / macOS | ✅ Aplicaciones de escritorio | [Microsoft](https://support.microsoft.com/es-es/office/requisitos-del-sistema-para-microsoft-365-para-el-hogar-71423642-bbbb-4811-93e3-add3ff2d3192) |
| **LibreOffice** | 256 MB de RAM mínimo, 512 MB recomendados en Windows/Linux | ✅ | [LibreOffice](https://es.libreoffice.org/descarga/requisitos-del-sistema/) |
| **ONLYOFFICE Desktop Editors** | 2 GB de RAM o superior | ✅ | [ONLYOFFICE](https://helpcenter.onlyoffice.com/es/desktop/installation/desktop-sys-reqs-windows.aspx) |
| **Google Docs / Sheets / Slides** | En función del navegador; sin cifra autónoma de escritorio directamente equiparable | ⚠️ Modo offline disponible tras configuración | [Google](https://support.google.com/docs/answer/6388102?hl=es) |

> **Importante:** la memoria RAM mínima de un sistema y el conjunto de trabajo (working set) de una aplicación son métricas distintas. La tabla se ofrece a modo de contexto, sin pretender que sean intercambiables.

Un banco de pruebas reproducible para Astraea debe registrar al menos:

```text
Inicio en frío (Cold launch)
Consumo en reposo tras estabilización
Carga con documento de Writer
Carga con cálculos en Grid
Carga con documentos PDF
Estado de indexación de búsqueda
Peak working set
Private working set
Uso de CPU en reposo
SO de prueba / WebView / hash de compilación
```

---

# Una comparación ecuánime con otras suites ofimáticas

Astraea no necesita argumentos infundados sobre otros productos para explicar su propuesta.

Las aplicaciones de escritorio de Microsoft 365 permiten guardar archivos localmente o en OneDrive / SharePoint. Google Docs, Sheets y Slides admiten modo sin conexión tras activarlo. LibreOffice y ONLYOFFICE Desktop Editors trabajan de manera predeterminada con archivos locales sin conexión.

Por consiguiente, la diferencia que plantea Astraea no se resume en "las demás soluciones obligan a usar la nube".

Radica en la **combinación** de propiedad local de la información, un modelo de objetos común entre herramientas, políticas de red explícitas, contenedores cifrados integrados, una edición Open Core libre y una interfaz unificada que abarca ofimática, conocimiento, seguridad y automatización.

| Característica | Astraea Workspace | Microsoft 365 | Google Workspace | LibreOffice | ONLYOFFICE Desktop |
|---|---|---|---|---|---|
| **Modelo principal** | Espacio de trabajo local-first | Escritorio + servicios en la nube | Suite web cloud-first | Suite de escritorio local | Suite de escritorio local + nube opcional |
| **Flujos con archivos locales** | ✅ De primer nivel | ✅ Admitidos | ⚠️ Modo offline para editores admitidos | ✅ | ✅ |
| **Cuenta en la nube obligatoria para edición local** | No | Según producto/licencia | Servicio basado en cuenta | No | No |
| **Base de escritorio de código abierto** | ✅ Open Core, AGPLv3 | No | No | ✅ MPLv2 | ✅ AGPLv3 |
| **Modelo de objetos compartido Astraea** | ✅ WOM | Arquitectura diferente | Arquitectura diferente | Arquitectura diferente | Arquitectura diferente |
| **Contenedores cifrados Astraea** | ✅ | Arquitectura diferente | Arquitectura diferente | Arquitectura diferente | Arquitectura diferente |
| **Cero telemetría por diseño en Astraea** | ✅ | Según proveedor | Según proveedor | Según proyecto | Según proveedor |
| **Expansión comercial para equipos/datos** | ✅ Premium | ✅ | ✅ | Ecosistema / terceros | ✅ |

Referencias oficiales consultadas para la comparativa:

- Almacenamiento local y en la nube en Microsoft: https://support.microsoft.com/es-es/office/guardar-archivos-en-microsoft-365-70da744d-0f4d-472e-9f6d-b6480b556942
- Edición sin conexión en Google: https://support.google.com/docs/answer/6388102?hl=es
- Requisitos de sistema de LibreOffice: https://es.libreoffice.org/descarga/requisitos-del-sistema/
- Operación de escritorio sin conexión en ONLYOFFICE: https://helpcenter.onlyoffice.com/es/desktop/getting-started.aspx

---

# Las 20 aplicaciones integradas

## Ofimática y publicación

### Astraea Writer — `.vdoc`
Edición profesional de documentos, tipografía, estilos, tablas, citas bibliográficas, contenido estructurado y exportación.

### Astraea Grid — `.vgrid`
Hojas de cálculo multilibro, fórmulas matemáticas, análisis, gráficos y tratamiento de datos tabulares.

### Astraea Present — `.vpresent`
Presentaciones vectoriales, diseño de diapositivas, contenido multimedia y modos de ponente.

### Astraea Publish — `.vpub`
Autoedición editorial (DTP) para catálogos, folletos, maquetación multipágina y artes gráficas orientadas a impresión.

## Conocimiento, ideación y creatividad

### Astraea Notes — `.vnote`
Gestión del conocimiento personal (PKM), notas interconectadas, soporte Markdown y relaciones semánticas.

### Astraea Whiteboard — `.vboard`
Lienzo infinito, diagramas de flujo, mapas conceptuales, planificación visual y objetos interactivos en vivo.

### Astraea Draw — `.vdraw`
Dibujo vectorial, capas, curvas Bézier y recursos orientados al formato SVG.

### Astraea PDF Studio — `.vpdf`
Visualización y manipulación de documentos PDF con anotaciones, firmas y censura/redacción de seguridad.

## Tareas, planificación y ejecución

### Astraea Tasks — `.vtask`
Gestión de tareas personales, recurrencias, prioridades, subtareas y vínculos directos a elementos del espacio de trabajo.

### Astraea Planner — `.vplan` — Premium
Tableros Kanban, asignación de carga de trabajo, cronogramas y coordinación de equipos.

### Astraea Projects — `.vproj` — Premium
Fases de proyecto, hitos, dependencias, diagramas de Gantt y control de riesgos.

## Datos, formularios y analítica

### Astraea Forms — `.vform` — Premium
Creación de formularios y encuestas, lógica condicional y recogida estructurada de respuestas.

### Astraea Database — `.vdb` — Premium
Modelos de datos relacionales sin código tipizados, registros estructurados y vistas enlazadas al espacio de trabajo.

### Astraea Insight — `.vinsight`
Cuadros de mando locales, indicadores clave (KPI), paneles y analítica derivada del espacio de trabajo.

## Seguridad, automatización y conectividad

### Astraea Vault — `.vvault`
Caja fuerte para credenciales cifradas, archivos confidenciales y datos protegidos.

### Astraea Spaces — `.vspace` — Premium
Espacios para equipos y organizaciones con roles de acceso y contexto de directivas.

### Astraea Connect — `.vconnect`
Conectores externos controlados y límites definidos de integración.

### Astraea Automate — `.vauto`
Automatización local y determinista de flujos de trabajo.

### Astraea Admin & Policy — `.vpolicy`
Gestión de seguridad, administración de directivas y configuración ajustada a la edición instalada.

### Astraea GaiaCom — `.vgcom` — Premium
Comunicaciones cifradas y sincronización mesh para entornos de colaboración protegidos.

---

# Precios y licenciamiento

## Open Core

| Edición | Precio | Licencia | Disponibilidad |
|---|---:|---|---|
| **Astraea Open Core** | **0 €** | **GNU AGPLv3** | Libre para siempre |

Open Core no caduca ni requiere ninguna suscripción periódica.

## Licenciamiento comercial Premium planificado

Astraea Premium se distribuirá mediante una **licencia comercial perpetua**, sin suscripciones recurrentes forzadas.

| Edición | Disponibilidad prevista | Precio único previsto | Actualización mayor prevista |
|---|---:|---:|---:|
| **Premium Beta Early-Bird** | Nov 2026 – Feb 2027 | **39,99 €** | **~45,99 €** |
| **Premium Regular** | Desde marzo 2027 | **69,00 €** | **~45,99 €** |
| **Entidades sin ánimo de lucro y educación** | Organizaciones elegibles | **36,99 €** | **9,99 €** |

> [!NOTE]
> La edición Premium aún no ha iniciado su comercialización. Las condiciones mostradas corresponden a las previsiones actuales y se consideran tarifas preliminares hasta la apertura oficial de la compra y expedición de licencias.

---

# Instalación

## Archivos binarios públicos

Los instaladores oficiales y paquetes de distribución se publicarán en **GitHub Releases** una vez superados los controles de calidad del lanzamiento público.

Plataformas de destino:

```text
Windows
macOS
Linux
```

La disponibilidad puede variar según la plataforma si alguna verificación específica para un sistema operativo sigue en proceso.

## Compilación desde el código fuente

### Requisitos previos

- Node.js 20 LTS o 22 LTS
- Rust / Cargo
- Tauri CLI v2
- Dependencias de compilación propias de la plataforma para Tauri

### Interfaz de usuario (UI)

```bash
cd ui
npm ci
npm run typecheck
npm run build
```

### Entorno de escritorio

```bash
cd crates/vgt-desktop
cargo tauri dev
```

Generación del paquete de producción:

```bash
cargo tauri build
```

> Los comandos de compilación y las versiones de herramientas deben ajustarse a los archivos lockfile del repositorio y a la documentación de lanzamiento vigente si difieren de los ejemplos anteriores.

---

# Requisitos del sistema

Objetivo preliminar de la versión:

- **RAM:** 4 GB de memoria principal como mínimo; 8 GB recomendados para flujos con múltiples documentos abiertos
- **Almacenamiento:** El tamaño de instalación final se indicará con el paquete definitivo
- **Pantalla:** Monitor de escritorio estándar; la interfaz soporta escalado adaptativo de accesibilidad
- **Internet:** No requerida para la edición local; solo necesaria para funciones de red habilitadas voluntariamente por el usuario, actualizaciones o conectores externos

Las versiones específicas de los sistemas operativos admitidos se publicarán junto con los artefactos de distribución.

---

# Estado de preparación para el lanzamiento (Release Readiness)

El plan maestro original para la implementación del núcleo alcanzó:

```text
3334 / 3334
```

Esta cifra certifica la compleción de la lista de tareas de la implementación central.

Por sí sola, **no** equivale a que el lanzamiento público esté concluido.

La beta pública se somete a una fase específica de consolidación que comprende:

```text
Separación física del código fuente de ambas ediciones
Definición de límites funcionales entre Open Core y Premium
Workspace Explorer / Library
Flujos de inserción y arrastrar y soltar entre aplicaciones
Renovación integral del sistema de diseño
Verificación de temas en todas las interfaces
Guías interactivas integradas
Conexión de las preferencias de configuración
Localización idiomática
Accesibilidad
Evidencias formales de seguridad
Pruebas de ciclo completo (roundtrips)
Regresión de importación y exportación
Comportamiento de recuperación de fallos
Rendimiento
Empaquetado de instaladores
Generación de SBOM / hashes / trazabilidad de compilación
Revisión de defectos visibles previa a la publicación
```

El estado del repositorio pasará de **Pre-Release** a **Beta** únicamente cuando estas condiciones estén plenamente evidenciadas en el árbol de publicación real.

---

# Documentación

Documentación técnica y descriptiva disponible:

| Documento | Idioma | Tipo |
|---|:---:|---|
| [What is Astraea Workspace?](./01_Astraea_Workspace_What_It_Is_EN.pdf) | Inglés | Producto / concepto |
| [Premium Security & Sovereignty](./02_Astraea_Workspace_Premium_Security_Sovereignty_EN.pdf) | Inglés | Whitepaper técnico |
| [Was ist Astraea Workspace?](./01_Astraea_Workspace_Was_es_ist_DE.pdf) | Alemán | Producto / concepto |
| [Premium Sicherheit & Souveränität](./02_Astraea_Workspace_Premium_Sicherheit_Souveraenitaet_DE.pdf) | Alemán | Whitepaper técnico |
| [Produktivität & Datenfluss](./03_Astraea_Workspace_Premium_Produktivitaet_Datenfluss_DE.pdf) | Alemán | Arquitectura de producto |
| [Che cos'è Astraea Workspace?](./01_Astraea_Workspace_Che_Cose_IT.pdf) | Italiano | Producto / concepto |
| [Sicurezza Premium & Sovranità](./02_Astraea_Workspace_Premium_Sicurezza_Sovranita_IT.pdf) | Italiano | Whitepaper técnico |
| [¿Qué es Astraea Workspace?](./01_Astraea_Workspace_Que_Es_ES.pdf) | Español | Producto / concepto |
| [Seguridad Premium & Soberanía](./02_Astraea_Workspace_Premium_Seguridad_Soberania_ES.pdf) | Español | Whitepaper técnico |
| [Qu'est-ce qu'Astraea Workspace ?](./01_Astraea_Workspace_Ce_Que_Cest_FR.pdf) | Francés | Producto / concepto |
| [Sécurité Premium & Souveraineté](./02_Astraea_Workspace_Premium_Securite_Souverainete_FR.pdf) | Francés | Whitepaper técnico |
| [Что такое Astraea Workspace?](./01_Astraea_Workspace_What_It_Is_RU.pdf) | Ruso | Producto / concepto |
| [Премиальная безопасность и суверенитет](./02_Astraea_Workspace_Premium_Security_Sovereignty_RU.pdf) | Ruso | Whitepaper técnico |

---

# Transparencia de la cadena de suministro (Supply Chain)

El procedimiento de publicación de Astraea está estructurado para permitir la verificación independiente de las compilaciones entregadas:

Las evidencias oficiales de distribución incluirán, según se generen en la fase final:

```text
Inventario de dependencias y licencias
SPDX SBOM
Hashes de distribución SHA-256
Manifiesto de lanzamiento firmado
Trazabilidad de compilación (provenance)
```

Los artefactos resultantes constituyen la referencia definitiva en materia de dependencias y versiones.

Este documento prescinde deliberadamente de mantener una tabla manual de librerías propensa a desajustes frente a `Cargo.lock`, `package-lock.json`, `go.sum` y el SBOM procesado.

---

# Licencia

**Astraea Workspace Open Core se distribuye bajo la licencia GNU Affero General Public License v3.0 (AGPL-3.0).**

Consúltese:

- [`LICENSE`](./LICENSE)
- [`NOTICE`](./NOTICE), donde figure
- Los avisos propios de cada dependencia y el SBOM de la versión

Astraea Premium se comercializa y distribuye por separado bajo su licencia propietaria.

---

# Visión

Las herramientas de software deben facilitar la creación, la planificación, el análisis y la colaboración sin exigir a las personas que renuncien al control de su espacio de trabajo.

Astraea Workspace se fundamenta en ese compromiso:

**local cuando trabajar en local basta; explícito cuando la red es necesaria; abierto donde rige el principio de Open Core; e interoperable en todo el conjunto en lugar de disgregado en utilidades aisladas.**

<p align="center">
  <strong>Astraea Workspace</strong><br>
  <em>Your Mind. Your Work. Your Sovereignty.</em><br><br>
  <sub>© 2026 VisionGaiaTechnology · Open Core licenciado bajo AGPL-3.0</sub>
</p>
