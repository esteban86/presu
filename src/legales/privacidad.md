# Política de privacidad — Presu

_Última actualización: 22 de octubre de 2026._

Presu es una aplicación de escritorio de finanzas personales que funciona **principalmente
en tu equipo**. Tus **datos financieros** —cuentas, transacciones, extractos, presupuestos,
categorías— viven en tus dispositivos. Solo salen en texto legible para las funciones en la
nube que actives: lectura/categorización con IA, importación automática alojada y muestras
enmascaradas para construir lectores y el envío de un PDF que autorices por separado,
según se detalla abajo. Ese envío sigue desactivado mientras se valida la función.
Si activas la sincronización entre dispositivos, viajan **cifrados de
extremo a extremo** por un servidor que no puede leerlos.

Algunas funciones opcionales o del plan Pro usan servicios en la nube operados por Presu /
**Asimétrica** (Presu IA, licencias y pagos). En esos casos viaja únicamente el dato mínimo
que se describe abajo —nunca tu base de datos completa—. El texto enviado a Presu IA lleva
cédula y números de cuenta **enmascarados**. Las imágenes que eliges se transmiten como
archivo original porque no se pueden enmascarar a ciegas; cada sección explica cuándo ocurre
y qué se conserva.

## Qué datos se guardan y dónde

- Toda la información (cuentas, transacciones, extractos, presupuestos, categorías,
  configuración) se almacena en una base de datos SQLite local:
  `~/Library/Application Support/Presu/gastos.db` (macOS).
- Las credenciales sensibles (API keys, credenciales de Gmail, clave de licencia) se guardan
  cifradas (AES-256-GCM) en tu equipo. Si en el futuro eliges el modo Gmail automático alojado,
  su autorización se guarda cifrada por separado en la nube como se explica abajo.
- **Importante:** la base de datos `gastos.db` y sus backups se guardan **sin cifrar** en
  disco (solo las credenciales se cifran). Si te preocupa el acceso físico a tu equipo, activa
  el cifrado de disco del sistema (FileVault en macOS, BitLocker en Windows). Está en
  evaluación cifrar también la base de datos en una versión futura.
- **En el celular** pasa lo mismo: tus datos viven en una base de datos dentro de la app,
  **sin cifrar** en el aparato. Protégelo con un código de bloqueo.
- **Los respaldos de tu teléfono** (los hace el sistema, no Presu):
  - En **Android**, tus datos de Presu **no** entran al respaldo de Google ni pasan a un teléfono
    nuevo con el traspaso del sistema. Solo viajan ajustes internos de la app, sin ninguno de tus
    datos. Si cambias de celular, tus movimientos vuelven con tu cuenta de Presu (ver
    «Sincronización entre tus dispositivos»).
  - En **iPhone**, si tienes encendido el respaldo de iCloud, la base de Presu **sí** entra en él,
    como los datos de tus otras apps. Apple guarda ese respaldo cifrado, pero con la protección
    estándar de iCloud las llaves las tiene Apple. Si activas la **Protección avanzada de datos**
    de iCloud, solo tus aparatos pueden abrirlo. También puedes sacar a Presu del respaldo de
    iCloud en los ajustes de iCloud de tu iPhone.
- Por defecto, el texto de los extractos se procesa **en tu equipo**. Si activas la importación automática alojada,
  el adjunto candidato existe en memoria del servicio durante el intento y no se conserva allí. En escritorio,
  Presu conserva el **original completo** —el PDF, o el texto del correo de aviso de tu banco—, incluidos
  identificadores y números impresos, cifrado en un archivo local con una llave que protege el llavero de tu sistema,
  para poder reintentar o auditar la lectura. Se elimina tras el plazo que eliges en **Ajustes » Tus datos » Los PDF
  de tus extractos** (1 a 365 días). Puedes borrar tus datos cuando quieras desde **Ajustes » Tus datos » Borrar**:
  «Borrar movimientos y cuentas» o «Dejar Presu como nuevo». Antes de borrar, Presu guarda una **copia de seguridad en
  tu equipo**, que no se borra sola (se conservan las 10 más recientes); para no dejar ninguna, borra también la carpeta
  de Presu (ver «Tus controles»). En el celular,
  la copia temporal creada al elegir un PDF local se elimina al terminar el intento; el archivo
  original que elegiste en Archivos sigue bajo tu control.
- En el celular también puedes elegir un PDF de tu extracto y leerlo **en el aparato**:
  el archivo se abre y se lee en el celular, **no sale de él** y Presu **no guarda una
  copia**; se guarda solo lo leído (los movimientos y el resumen del extracto), igual que
  cualquier otro dato tuyo. Esta lectura no necesita el permiso de procesamiento alojado,
  porque nada se envía. Si el extracto tiene contraseña, se usa en el celular para abrirlo
  y no viaja a ningún lado en esa lectura; se guarda en el llavero seguro del aparato para no
  volver a pedírtela. Solo sale del celular si tú la eliges para abrir un extracto que llegó por
  correo (ver «Contraseña de un extracto que llegó por correo»).
- **Widgets.** Para que los widgets de Presu puedan mostrar cómo va tu mes, Presu guarda en tu celular un
  resumen chico: lo que llevas, tu tope, tus sobres y lo próximo que vence. Ese resumen no lo enviamos a
  ningún servidor y **no** entra a los respaldos del teléfono, ni al de iCloud ni al de Google. Se borra
  cuando usas «Borrar los datos de este celular». Un widget se ve sin pasar por el bloqueo de Presu,
  también en la pantalla de bloqueo del teléfono si lo pones ahí.

## Sincronización entre tus dispositivos (opcional, gratis)

Si activas la sincronización (para usar Presu en más de un computador o con la app del
celular), tus datos viajan entre tus dispositivos a través de un servidor intermedio
("relay") operado por Presu en Cloudflare. Cómo funciona:

- **Cifrado de extremo a extremo, de conocimiento cero.** Cada cambio se cifra
  (AES-256-GCM) **en tu dispositivo** con una llave que solo tus dispositivos conocen,
  derivada de tu frase de acceso. El servidor almacena únicamente los blobs cifrados: **no
  puede leer tus montos, comercios, cuentas, ni ningún contenido financiero**, y nosotros
  tampoco.
- **Qué viaja (cifrado):** tus movimientos, cuentas, categorías, presupuestos, deudas y
  ajustes relacionados — incluido, para movimientos detectados por correo, el **asunto y el
  remitente** del correo bancario (para que en tus otros dispositivos se vea de qué banco
  vino). Nunca el cuerpo del correo.
- **Qué NO sale de cada dispositivo por la sincronización:** los PDF de tus extractos y su vínculo con cada
  movimiento, tus credenciales de correo local, y el estado local de revisión de duplicados.
  La importación automática alojada es una excepción que activas y puedes revocar. El envío directo de un PDF,
  cuando se habilite, tendrá una autorización documental específica para ese archivo.
- **Qué ve el servidor (sin cifrar):** metadatos mínimos para operar el servicio — un
  identificador de tu cuenta y de cada dispositivo, marcas de tiempo y el tamaño de los
  bloques. Nada del contenido.
- **Aviso de cambios nuevos (mientras Presu está abierto):** con la app abierta (en el celular,
  cuando está en pantalla), cada dispositivo mantiene una conexión con el servidor para enterarse
  enseguida de que otro dispositivo tuyo subió algo. Por esa conexión **solo viaja un número de
  secuencia**, nunca contenido. Para eso el servidor recuerda, por cuenta, ese número y qué
  dispositivos están conectados en ese momento (lo olvida al desconectarse). Para abrir la conexión
  se usa una credencial que vence en un minuto y sirve una sola vez. Si borras tu cuenta, estas
  conexiones se cierran.
- **Desactivarla:** en el escritorio, Ajustes » Sincronización » Apagar la sincronización; en el
  celular, Más » Sincronización » Desvincular este celular. Tus datos locales quedan intactos en
  cada dispositivo.

## Integraciones opcionales (las activas tú)

- **Gmail local (opcional):** si la conectas, Presu lee tus correos con permiso de solo lectura
  (`gmail.readonly`) únicamente para detectar notificaciones de transacciones y extractos
  bancarios. Los datos se procesan en tu equipo. Además, mientras guardas la llave de tu Presu con
  un correo que ya conectaste en el escritorio (por Gmail o con contraseña de aplicación), busca
  también el **correo de Presu con tu código** (de hola@presu.io), para usarlo sin pedirte que lo
  copies; no guarda ni ese correo ni el código, y lo lee en tu equipo.
- **Gmail automático alojado (todavía no activo en producción):** cuando esté disponible, puedes
  autorizarlo por separado para que Presu busque correos bancarios aunque la aplicación esté
  cerrada. Después de la autorización de Google, la búsqueda es automática; no tienes que enviar
  cada correo. El servidor usa consultas limitadas a remitentes bancarios conocidos, asuntos
  concretos o la etiqueta `Presu`; no barre tu correspondencia personal para decidir qué leer.
  Conserva el refresh token con cifrado por sobre en almacenamiento separado, nunca el access
  token, y reemplaza tu dirección por un HMAC no reversible. Durante el descubrimiento guarda
  solo identificadores opacos de candidatos hasta 30 días. Cuando la lectura alojada se active,
  descargará únicamente esos candidatos bancarios para extraer la transacción o el extracto y
  entregar a tus dispositivos una propuesta cifrada de extremo a extremo. La autorización tiene
  vencimiento rodante máximo de 180 días mientras siga activa; al desconectar Presu intenta revocar
  la concesión en Google y borra credencial, HMAC, cursor y candidatos alojados aunque Google no esté
  disponible. También puedes retirar el acceso desde los controles de tu cuenta Google.
  Si encendiste Presu IA para los extractos que no entiendo, ver «Extractos que el servicio alojado no
  entiende».
  Esta ingesta alojada no convierte el correo o el PDF en una muestra para construir lectores. En
  desktop, ese aporte tiene un permiso separado junto al importador y puede retirarse sin apagar la
  conexión de correo.
- **Outlook automático alojado (todavía no activo en producción):** funciona con el mismo permiso separado y la
  misma frontera de datos mediante Microsoft Graph. Puedes desconectarlo en Presu o retirar el acceso desde tu cuenta
  Microsoft.
- **Tus correos leídos en el celular (opcional):** si conectas uno o varios, el celular entra a cada buzón con ese
  correo y una **contraseña de aplicación** que creas en tu proveedor solo para Presu. Cada
  contraseña se guarda en el llavero seguro de **este** aparato: no se envía a Presu, no viaja por el sync ni en
  copias de seguridad. Con **Outlook o Hotmail** no se usa contraseña de aplicación: entras con tu cuenta de
  Microsoft, y Microsoft le da a este celular el permiso para leer tu correo por IMAP. Ese permiso se guarda en el
  llavero seguro de **este** aparato, no se envía a Presu y Presu abre el buzón en solo lectura. Puedes retirarlo
  desde tu cuenta de Microsoft cuando quieras. El celular abre el buzón en **solo lectura** (no marca nada como leído), busca únicamente los
  remitentes de **avisos y de extractos** de tu banco y los correos de **pagos aprobados de Wompi** (la pasarela de
  pagos: dicen el comercio, el monto y los últimos cuatro de la tarjeta). Mientras creas tu cuenta de Presu con ese
  mismo correo, busca también el **correo de Presu con tu código** (de hola@presu.io), para usarlo sin pedirte que lo
  copies; no guarda ni ese correo ni el código. Los lee en el aparato: **el correo no pasa por ningún
  servidor de Presu**, salvo lo que se explica en «Presu IA» si enciendes **«Leer correos con Presu IA»**, que viene
  apagado. **Un extracto adjunto se abre en este celular con la clave que guardaste en su llavero** (la misma de
  «Leer un extracto PDF»); **el PDF no se envía a Presu ni se guarda: solo queda el resultado.**
  Cada movimiento leído entra directo a tus movimientos, con la misma regla del escritorio para reconocer la cuenta
  y no duplicar lo que ya estaba; si no reconoce la cuenta, crea una nueva **sin confirmar**, fuera de tus totales
  hasta que la confirmes. Junto al movimiento guarda la identidad del correo del que salió (su `Message-ID`, para no
  importarlo dos veces), y en el aparato, la fecha de la última lectura. Al desconectar un correo, Presu borra su
  contraseña de este celular; lo ya leído se queda. También puedes borrar la contraseña de aplicación desde tu proveedor en
  cualquier momento.
- **PDF elegido en el celular:** la acción principal lo lee en el propio aparato, sin conectar correo ni enviarlo al
  servicio alojado. La copia temporal del selector se borra al terminar; el original en Archivos sigue bajo tu control.
  Presu conserva el resultado financiero local, no el PDF original. Si el formato no se reconoce, debes volver a
  elegir el archivo cuando haya un lector compatible.
- **PDF alojado elegido por ti:** primero eliges el archivo y ves una
  explicación específica antes de autorizar su envío. El permiso es para **ese PDF y ese dispositivo**, vence en
  30 minutos y puedes revocarlo. Conectar Gmail u Outlook no lo concede, y este permiso no conecta tu correo.
  Presu enviará el **PDF completo sin enmascarar** y, si hace falta para abrirlo, la contraseña que escribas, al
  servicio alojado para leer el extracto; por eso sus datos financieros sí serán legibles para ese servicio durante
  el procesamiento. No guardamos el PDF ni su contraseña como muestra. El resultado se entrega cifrado para tu
  dispositivo y la entrega temporal vence en 30 minutos. Los movimientos incorporados se guardan en tu
  aparato. Si revocas el permiso, no habrá nuevas entregas, pero no se borran los movimientos ya incorporados.
  Si el trabajo vence o el formato no se reconoce, debes volver a elegir el archivo para otro intento.
  Si encendiste Presu IA para los extractos que no entiendo, ver «Extractos que el servicio alojado no
  entiende».
  Para aplicar el límite mensual de extractos del servicio alojado, Presu cuenta cuántos leyó para tu
  cuenta cada mes: guarda solo ese número, sin el contenido ni el nombre del archivo, y lo borra con tu cuenta.
  El endpoint heredado de subida sigue cerrado; los adjuntos bancarios autorizados por correo usan su propio flujo.
- **Contraseña del PDF elegido en el celular:** si un extracto tiene contraseña —en Colombia suele ser tu cédula—,
  el celular te la pide y la guarda en el llavero seguro sólo cuando abre el documento **localmente**. La clave no
  sale del aparato en esa lectura; si no abre el extracto, Presu la olvida. Si eliges el procesamiento alojado,
  la contraseña que escribas se envía para ese intento y no se guarda en el llavero.
- **Contraseña de un extracto que llegó por correo:** si un extracto que Presu encontró en tu Gmail u
  Outlook con la importación alojada está protegido con contraseña, el celular te ofrece abrirlo. Solo
  cuando tocas «Abrir», la contraseña —la que escribas o la que guardaste en el llavero— se envía al
  servicio alojado para ese intento. El servicio vuelve a descargar ese adjunto de tu correo con el
  permiso que ya diste, lo abre en memoria y no guarda ni la contraseña ni el PDF. El celular nunca la
  envía por su cuenta, y si la contraseña no abre el extracto, te lo decimos y no se vuelve a intentar
  sola.
- Las integraciones de correo cumplen la política de **Limited Use** de Google: los datos no se usan para
  publicidad ni se transfieren para fines distintos de prestar esta función. El detalle está en
  «Datos de tu cuenta de Google (Gmail)».
- **TRM (tasa de cambio):** para convertir a pesos una compra en dólares, el computador y el
  celular consultan la TRM oficial en el portal público de datos del gobierno de Colombia
  (datos.gov.co). Solo se envía la **fecha** de la compra: ni el monto, ni el comercio, ni tus
  cuentas. El celular lo hace solo cuando un extracto trae compras en dólares, y si no puede
  consultar la tasa oficial de esa fecha, la compra espera en la bandeja hasta que pueda.
- **Archivo público de configuración:** el computador y el celular bajan de GitHub un archivo
  público con los interruptores de las funciones nuevas (Presu las enciende o apaga sin publicar
  una versión). El mismo archivo trae los precios, si el cobro está activo y la lista de
  remitentes de los bancos. La descarga no lleva ningún dato tuyo; como en cualquier descarga,
  GitHub ve la dirección de internet desde donde se hace.
- **Versión mínima del celular:** al abrir, y como mucho una vez por hora, el celular lee un archivo
  público en GitHub (el mismo que el computador consulta para los precios) que dice cuál es la
  versión más vieja que todavía puede sincronizar. La petición **no lleva nada tuyo**; GitHub ve
  lo que ve cualquier página web, como tu dirección IP. Si tu versión quedó por debajo, el celular
  deja de sincronizar y te pide actualizar, y lo que tienes en él se queda donde está.
- **Tasa de usura:** para decirte si una deuda cobra por encima del máximo legal, el computador
  (al abrir y cada 12 horas) y el celular (al abrir «Tu deuda») le piden a nuestro servidor la tasa
  de usura que certifica la Superintendencia Financiera. La petición **no lleva nada tuyo**: ni tu
  identificador, ni tus deudas, ni sus tasas. La comparación se hace en tu aparato.
- **Actualizaciones de la app del celular:** al abrir, el celular le pregunta a **Expo** (el
  servicio con el que se construye la app, EAS Update) si hay una versión nueva de su código; si la
  hay, la baja y la usa la próxima vez que abras Presu, sin pasar por la tienda. La petición lleva
  la plataforma (iPhone o Android), la versión de la app y un identificador aleatorio que se crea
  para esa instalación: **ni tu cuenta, ni tus datos financieros**. Expo la procesa según su propia
  política de privacidad.

## Datos de tu cuenta de Google (Gmail)

Esta sección junta en un solo lugar lo que Presu hace con los datos que recibe de Google cuando
conectas Gmail en el escritorio. El detalle de cada función está en las secciones que se citan.

- **Qué permiso pedimos.** Uno solo: `gmail.readonly`, leer tus correos. Con él Presu **no puede**
  enviar, borrar, mover ni marcar correos, y no pedimos acceso a tus contactos, tu calendario ni tu
  Drive.
- **Qué correos lee.** Presu no recorre tu buzón: le pide a Gmail solo los correos que coinciden con
  búsquedas por remitente. Son los avisos y extractos de los bancos que Presu reconoce, el extracto
  de tu crédito hipotecario, los correos a los que tú les pongas la etiqueta **«Presu»** y el correo
  de Presu con tu código de acceso (de hola@presu.io). El resto de tu correspondencia no se descarga.
- **Para qué.** Solo para convertir esos correos en tus movimientos y tus extractos dentro de Presu, y
  para leer tu código de acceso sin que lo copies. No los usamos para nada más.
- **Dónde se procesan.** En tu equipo. Lo único que sale, y solo si tú lo activas, es:
  - **Presu IA:** si enciendes «Usar IA en la nube», el **texto enmascarado** del cuerpo de un aviso
    bancario va a Presu IA para leer el movimiento, y se descarta al responder (ver «Presu IA»).
  - **Sincronización:** si la activas, el movimiento viaja a tus otros aparatos **cifrado de extremo
    a extremo**, con el asunto y el remitente del correo, nunca el cuerpo (ver «Sincronización
    entre tus dispositivos»).
  - **Gmail automático alojado:** todavía no está activo; cuando lo esté, funcionará como se explica
    en «Integraciones opcionales».
- **Qué se guarda y cuánto tiempo.** En tu equipo quedan:
  - Los **movimientos**, con el identificador del correo, para no importarlo dos veces.
  - Una **copia cifrada del original** (el PDF adjunto o el texto del aviso), que se borra en el plazo
    que elijas, de 1 a 365 días (ver «Originales locales y retención»).
  - El **permiso de Google**, cifrado con el llavero del sistema (el Llavero en Mac, la protección de datos de
    Windows en Windows).
- **Con quién se comparte.** Los datos que recibimos de Google:
  - **No se venden.**
  - **No se usan para publicidad** ni para mostrarte anuncios.
  - **No se usan para decidir créditos o préstamos**, ni para evaluar tu capacidad de pago.
  - **No se usan para entrenar modelos de inteligencia artificial**, ni propios ni generales.
  - Solo se transfieren a los proveedores de Presu IA cuando tú la enciendes, enmascarados y para
    leer el movimiento (ver «Presu IA»), o cuando la ley lo exija.
- **Quién los ve.** Nadie del equipo de Presu lee tus correos. Lo que llega por Gmail tampoco se
  vuelve una muestra para arreglar lectores: esas salen solo de un PDF que elegiste en tu computador
  (ver «Diagnóstico y reporte de errores»). Las únicas excepciones son las que permite la política
  de Google: que haga falta para investigar un abuso o un problema de seguridad, o que la ley lo
  exija.
- **Cómo retiras el acceso.** En **Ajustes » Correo y extractos**, desconectando tu Gmail: Presu revoca el
  permiso ante Google y lo borra de tu equipo. También puedes retirarlo desde
  [los permisos de tu cuenta de Google](https://myaccount.google.com/permissions). Para borrar lo
  que ya se importó, ve a **Ajustes » Tus datos » Borrar**.
- **En el celular** Presu no usa este permiso: entra a tu correo con una contraseña de aplicación
  que creas tú (ver «Tus correos leídos en el celular»).

**Uso limitado (Limited Use).** El uso que Presu hace de la información que recibe de las API de
Google, y su transferencia a cualquier otra aplicación, cumple la
[Política de datos de usuario de los servicios de API de Google](https://developers.google.com/terms/api-services-user-data-policy),
incluidos los requisitos de uso limitado.

> Presu's use and transfer to any other app of information received from Google APIs will adhere
> to the [Google API Services User Data Policy](https://developers.google.com/terms/api-services-user-data-policy),
> including the Limited Use requirements.

## Presu IA (categorización y lectura en la nube)

Presu IA está incluida en **todos los planes**: el gratis con un límite mensual de uso y los de
pago con uno mayor. **En el escritorio viene apagada**: no sale nada a la nube hasta que
enciendas **«Usar IA en la nube»** (en **Ajustes » Privacidad** o en **Ajustes » Presu IA**);
mientras tanto, categoriza el **modelo local** que corre en tu equipo. En **Ajustes » Presu IA**
eliges también quién hace el trabajo: Presu IA, **tu propia clave** de OpenAI/OpenRouter, o
solo el modelo local. **En el celular** hay dos interruptores, en **Más » Qué sale de este
celular**: **«Leer fotos con Presu IA»** lee la foto de un recibo cuando tú la tomas (ver abajo) y
viene encendido; **«Leer correos con Presu IA»** lee los avisos de tu banco que el celular no
entiende por sí solo (ver abajo) y **viene apagado**. Cuando está encendida en el escritorio:

- **Al sugerir categorías** se envía el **texto enmascarado** del movimiento (con cédula y
  números de cuenta ocultos). **Al leer un extracto** en PDF se envía el **texto
  enmascarado** de sus páginas (cédula, números de cuenta, números de celular y —desde la
  segunda importación— el nombre del titular; ver el punto siguiente).
- **Al leer un correo de tu banco** se envía el **texto enmascarado** de su cuerpo, con el
  mismo tratamiento que el extracto: se tapan la cédula, los números largos de cuenta o
  tarjeta, los números de celular, los sufijos del tipo «terminada en 3496» y el nombre del
  titular que Presu ya haya aprendido. **Los montos se conservan a propósito**: sin ellos no se puede leer el movimiento.
  Se envía únicamente el cuerpo del correo que Presu identificó como notificación bancaria, y
  solo con ese fin. Para evitarlo, apaga **«Usar IA en la nube»** (está en **Ajustes »
  Privacidad** y también en **Ajustes » Presu IA**) o elige un **modelo local** en **Ajustes »
  Presu IA**: con cualquiera de los dos, el cuerpo del correo no sale de tu equipo.
- **En el celular, al leer un correo de tu banco** —solo si encendiste **«Leer correos con Presu
  IA»**, que viene apagado— se envía el **texto enmascarado** del cuerpo de los avisos que ni el
  lector de tu banco ni el lector genérico entienden; lo que el celular lee por sí solo no sale.
  Se tapa lo mismo que en el escritorio (cédula, números largos de cuenta o tarjeta, números de
  celular, los sufijos del tipo «terminada en 3496»), y los últimos cuatro dígitos se leen en el
  aparato y no se envían. **Una diferencia, dicha con precisión: el celular no conoce el nombre
  del titular**, así que ahí no se puede tapar. Se envía con el **id aleatorio del celular**,
  cuenta contra el cupo de Presu IA de ese aparato, y cada correo se pregunta **una sola vez**:
  el celular guarda, solo en el aparato, una huella del correo (no su contenido) para no volver a
  enviarlo. Apagar el interruptor detiene los envíos.
- **Tres límites del enmascarado, dichos con precisión.** Un número de cuenta **de 10 dígitos**
  que aparezca suelto —sin un rótulo como «Cuenta de ahorros» o «Número de cuenta» y sin
  guiones— puede pasar sin taparse, porque así no se distingue de un monto (sin rótulo, la
  regla cubre los de 11 o más). Y el nombre del titular solo se
  tapa si Presu **ya lo aprendió** de un extracto tuyo — si nunca importaste uno, no lo
  conoce y no puede ocultarlo. Estamos trabajando en las dos cosas. Una cédula escrita sola, sin
  ningún rótulo delante (ni «CC», «Cédula», «Identificación» ni «Documento»), puede pasar sin
  taparse, porque así no se distingue de un monto escrito sin puntos. Lo mismo puede pasar con
  algunas formas poco comunes de escribirla con rótulo que se confunden con un monto, como
  «CC - 52.345.678».
- En todos los casos: **no guardamos ese texto**; se usa para responder y se descarta.
- **El nombre del titular** impreso en el extracto no sigue un patrón que se pueda detectar,
  así que no hay forma de ocultarlo a ciegas. Presu lo aprende de la **primera** importación
  de cada persona y **desde la segunda en adelante también lo oculta**. Ese nombre aprendido
  se guarda solo en tu equipo y no viaja a tus otros dispositivos.
- **Imágenes que tú eliges** —foto de recibo y pantallazos elegidos o compartidos desde otra app en el celular,
  capturas de pantalla en el escritorio—: esa imagen se envía **sin enmascarar** a Presu IA con el único fin de leer el
  monto, el comercio, la fecha, el sentido del movimiento y la cuenta visible. Una imagen no se puede enmascarar a ciegas, así que se envía
  **solo** cuando tú disparas la captura, eliges el archivo o lo compartes a Presu, viaja con el **id aleatorio de
  dispositivo** (no tu nombre ni tu correo) y **no se guarda**: se usa para responder y se
  descarta.
- **Páginas escaneadas de un extracto:** si activas por separado **«Leer páginas escaneadas
  con OCR remoto»**, Presu envía como imagen únicamente las páginas del PDF que no tienen una
  capa de texto legible. Esas páginas pueden mostrar tu nombre, cuenta, saldos y movimientos y
  no se pueden enmascarar antes de leerlas. Se procesan de una en una; Presu no conserva una
  copia en su backend y el proveedor configurado las trata según su propia política. Las páginas
  que ya tienen texto permanecen en tu equipo. Apagar ese permiso impide nuevos envíos de
  imágenes aunque siga activa la lectura de texto con IA.
- **Extractos que el servicio alojado no entiende (apagado por defecto):** si enciendes «Presu IA
  para los extractos que no entiendo» en Correo y extractos, y un extracto que llegó por tu correo
  o que subiste no coincide con ningún lector, el servicio alojado envía su texto a Presu IA para
  leerlo. Antes tapa las cédulas y los números de cuenta; el nombre del titular puede ir sin tapar,
  porque el servicio no lo conoce. Los extractos escaneados no se envían. Presu no guarda ese texto:
  se usa para leer el extracto y se descarta, y el resultado vuelve cifrado para tu dispositivo,
  igual que cualquier otro extracto. No cuenta como un extracto más del mes. Puedes apagarlo cuando
  quieras.
- Para controlar costos y abuso llevamos **contadores por dispositivo** identificados por un
  **id aleatorio** (no por tu nombre ni tu correo). De esos contadores derivamos **totales
  agregados** —cuántos equipos usaron la IA en el mes y cuántos llegaron al límite— para saber
  si los límites de cada plan están bien puestos. Esos totales son números sueltos: no llevan
  id de dispositivo ni ningún dato tuyo.
- También puedes usar **tu propia API key** (OpenAI/OpenRouter), en cuyo caso aplica la
  política de privacidad del proveedor que elijas.
- **Quién lo procesa:** Presu IA se lo pide a **Anthropic** (sus modelos Claude); si Anthropic
  no responde, el mismo pedido va por **OpenRouter**, que lo entrega a **OpenAI**. Ninguno recibe
  más de lo descrito arriba, y cada uno lo trata según su propia política.

## Registro de consentimientos de finanzas abiertas

**Todavía no está disponible: no hay ninguna conexión con bancos por finanzas abiertas.**
Lo describimos acá porque el registro ya existe en nuestro servidor y queremos que sepas de
antemano qué guardaría, no después.
Al desplegar el registro, el alta de nuevos consentimientos estará desactivada hasta que se
habilite expresamente para una cohorte. La consulta, confirmación de permisos anteriores y
revocación seguirán disponibles si llegara a existir un registro previo; apagar nuevas altas
no debe impedirte retirar un permiso.

Cuando el marco de finanzas abiertas de Colombia (Decreto 0368 de 2026) entre en operación y
tú autorices que un banco nos comparta tus movimientos, guardaremos en nuestro servidor un
**registro del consentimiento**: qué autorizaste, a qué entidad, para qué finalidad, hasta
cuándo, desde qué dispositivo y en qué momento pasó cada cosa (la autorización, la
confirmación del banco, la revocación y su acuse).

Tres cosas sobre ese registro:

- **No hay ningún campo donde quepan tus datos financieros.** El registro no tiene dónde
  guardar montos, comercios, números de cuenta ni saldos: guarda el permiso —qué, a quién,
  para qué y hasta cuándo— y nada más. Hay una prueba automática en nuestro código que falla
  si alguien intenta agregarle un campo de esa clase.
  Para ser exactos: esa prueba vigila **qué campos existen**, no qué se escribe adentro de
  ellos. La finalidad y las categorías son texto, y mientras la Superintendencia Financiera
  no publique su diccionario de datos no los contrastamos contra una lista cerrada.
- **Se guarda en texto legible, y es a propósito.** El resto de lo que sincronizamos va
  cifrado de forma que ni nosotros podemos leerlo. Este registro no: la norma exige poder
  **demostrar** ante la Superintendencia Financiera, ante el banco y ante ti mismo qué
  autorizaste y cuándo, y no se demuestra lo que nadie puede leer. Es la única excepción, y
  se sostiene porque adentro no hay plata.
- **Es de solo-agregar, y está encadenado.** La base de datos misma impide modificar o
  borrar una anotación —no es una regla que dependa de que nosotros la respetemos— y cada
  anotación lleva el hash de la anterior, así que si alguien alterara una ya registrada, o
  sacara una del medio, la verificación lo detecta. Eso te protege a ti: es lo que hace que
  «yo nunca autoricé eso» se pueda resolver mirando el registro en vez de creyéndole a quien
  lo guarda.
  **Dónde está el límite, dicho de frente:** el encadenamiento **no detecta que le corten
  las últimas anotaciones**, porque una cadena más corta sigue siendo válida por dentro.
  Cerrar ese hueco exige que el último hash salga de nuestra propia base de datos, y para
  eso es el recibo que te explicamos abajo. Te lo decimos porque «registro verificado» no es
  lo mismo que «no falta nada», y preferimos que sepas dónde termina la garantía a que la
  supongas más grande.

**Tu recibo, para no depender solo de nosotros.** Cada vez que abras «Tus autorizaciones»
en la app de escritorio, y cada vez que las actualices o revoques una, te entregaremos un
**recibo firmado** de tu última anotación: cuál es, su hash y en qué momento lo firmamos. La app
comprueba la firma con una llave pública que viene fijada dentro de ella, no con una que te
mandemos junto al recibo, y te deja guardar una copia donde tú elijas, con las instrucciones
para que cualquiera la verifique sin preguntarnos. Si más adelante tu registro no coincidiera
con ese recibo —porque le falta esa anotación, o porque ella o alguna anterior cambió—, ese
recibo es la prueba. Lo que el recibo **no** cubre:

- **Solo llega hasta la anotación que nombra.** Lo que se registre después se puede cortar
  sin rastro hasta tu siguiente recibo.
- **Solo te sirve si guardas la copia fuera de Presu.** Un recibo que solo conservemos
  nosotros no prueba nada: te protege de que el custodio borre anotaciones, y el custodio
  somos nosotros.
- **Vale mientras nuestra llave de firma no se filtre.** Si se filtrara, los recibos
  firmados con ella —también los anteriores a la filtración— dejarían de valer como prueba,
  porque cualquiera podría haberlos fabricado.

**Revocar no depende del banco.** Cuando retires una autorización, la revocación queda
registrada y tiene efecto de inmediato, aunque el banco no conteste. El acuse del banco, si
llega, se anota aparte.

Puedes ejercer tus derechos de Habeas Data (Ley 1581 de 2012) sobre este registro
escribiéndonos (ver Contacto). Ten en cuenta que, por su naturaleza de registro de
cumplimiento, podemos estar obligados a conservarlo durante el plazo que fije la norma
incluso después de que revoques la autorización.

## Registro de la Beta de Pioneros

Si activas la Beta de Pioneros, **con tu autorización expresa** enviamos tu **correo** a nuestro
backend (Cloudflare) para una sola cosa: **validar que estás en la lista de inscritos** y vincular
tu licencia gratuita a este equipo. Lo hacemos por correo + código, o con "Continuar con Google/
Microsoft" (en ese caso recibimos solo tu correo verificado, nunca tu contraseña). **En este paso
no viaja ningún dato financiero**: es identidad de cuenta. (Si activas la sincronización entre
dispositivos, tus movimientos sí viajan, cifrados de extremo a extremo — ver "Sincronización entre
tus dispositivos" arriba.) Puedes ejercer tus derechos de Habeas Data (Ley 1581 de 2012)
escribiéndonos (ver Contacto).

## Tu cuenta de Presu (tu correo)

Para usar Presu te pedimos una cuenta: tu **correo**, confirmado con un código de 6 dígitos.
Te la pedimos al abrir la app, en el escritorio y en el celular, también si ya usabas Presu sin
cuenta; lo que ya tenías se queda como estaba. Sirve para que el día que cambies de computador o
de celular, o le pase algo a este, podamos reconocerte como su dueño y devolverte lo que ya
habías pagado.

- **Guardamos dos cosas:** tu **correo** y un **id de dispositivo aleatorio** (no tu nombre,
  no tu cédula), más el vínculo entre los dos. En el celular, confirmar la cuenta también
  registra la **llave pública** con la que ese celular firma sus pedidos; la llave privada
  no sale de él.
- **No viaja ningún dato financiero.** Ni movimientos, ni saldos, ni números de cuenta.
  Tener cuenta **no** sube tu información: solo dice a quién pertenece este equipo.
- **Se guarda solo si confirmas el correo.** Te enviamos un código de 6 dígitos y el
  registro se crea cuando lo escribes — así nadie puede dejar tu correo registrado
  por ti.
- **Hace falta internet una vez**, para confirmar el código. Después Presu funciona sin
  conexión, como siempre.
- **La cuenta no enciende la sincronización** ni te pide una frase secreta: sincronizar tus
  dispositivos sigue siendo opcional (ver "Sincronización entre tus dispositivos").
- **Tener cuenta no te da el plan Pro.** Son cosas distintas: esto es identidad, no
  suscripción.

Aplica también cuando recuperas una licencia que ya compraste. Puedes ejercer tus derechos
de Habeas Data (Ley 1581 de 2012) —incluido **pedir que borremos tu correo y el vínculo con
tus equipos**— desde la app (ver "Borrar tu cuenta") o escribiéndonos (ver Contacto).

## Borrar tu cuenta

Puedes borrar tu cuenta **desde la app**, sin escribirnos: en el celular, Más » Privacidad
y cuenta » Borrar mi cuenta de Presu; en el escritorio, Ajustes » Cuenta y plan » Borrar
mi cuenta de Presu. Es distinto de "Borrar los datos de este celular" y de "Dejar Presu como
nuevo" (en el escritorio), que solo vacían ese aparato.

- **Lo confirmas con un código de 6 dígitos** que enviamos **al correo de la cuenta** —
  nunca a otro que se escriba en el momento. Así nadie borra tu cuenta con tu teléfono o tu
  computador en la mano.
- **Se borra todo lo que guardamos de ti en nuestro servidor**: tu correo y el vínculo con
  tus equipos, la configuración cifrada de la sincronización y el registro cifrado de
  cambios, tu uso, tus permisos y conexiones de importación alojada, y **los archivos** de
  esa importación (los PDF y correos que hayamos procesado). Si algún archivo no se puede
  borrar en ese momento, queda en una cola y se borra en el siguiente barrido.
- **No se puede deshacer.** Lo que tengas en tus dispositivos se queda ahí; lo que estaba
  solo en el servidor no se recupera.
- **Si lo haces desde el escritorio**, en ese equipo además se apaga la sincronización y se
  quita la licencia Pro: el equipo queda en el plan gratis, porque la licencia ya no existe
  en nuestro servidor. Tus movimientos se quedan en el equipo.
- **Lo que sí conservamos, y por qué:** el **registro de autorizaciones** de finanzas
  abiertas — qué permitiste, cuándo y cuándo lo retiraste. Ese registro es en sí mismo una
  obligación de la Ley 1581 (tenemos que poder demostrar que hubo autorización), **no
  contiene datos financieros** —ni montos, ni movimientos, ni números de cuenta— y al
  borrar la cuenta se le anota que retiraste todas tus autorizaciones.
- **Si tienes un plan familiar con personas que ya lo activaron**, el borrado se detiene y
  te lo decimos: de esa cuenta cuelga el acceso de otras personas. Sácalas del plan y
  vuelve a intentarlo.

## Licencias y pagos

Si compras el plan Pro:

- Guardamos en nuestro backend (Cloudflare) los **datos mínimos de tu cuenta y suscripción**:
  tu **correo**, un **id de dispositivo** aleatorio, y el **estado** de tu licencia/suscripción
  (plan, vigencia, pagos). Sirve para emitir, renovar y restaurar tu licencia.
- El **pago lo procesa Wompi** (pasarela colombiana). Los datos de tu tarjeta o medio de pago
  los maneja Wompi bajo sus estándares de seguridad (PCI); **Presu no ve ni almacena el número
  completo de tu tarjeta**. Aplica la política de privacidad de Wompi.
- Tu **licencia** es una clave firmada que se verifica sin conexión en tu equipo.
- **Señal de uso (mínima):** al abrir la app, esta ya consulta tu licencia/actualizaciones; en esa misma llamada registramos un **id de dispositivo aleatorio**, **la fecha** y **si es una versión de prueba** (esto último, para no contar nuestras propias pruebas como personas). Sirve para saber cuándo se usó Presu, entender el uso y poder avisarte/mejorar. **No** incluye datos financieros ni personales.

## Diagnóstico y reporte de errores

En el escritorio, el reporte de errores es **manual**. El diagnóstico usa una lista cerrada de estados y métricas técnicas: no incluye
páginas, texto de movimientos, montos, nombres de archivo, metadatos del extracto ni logs de la aplicación. El log para
soporte se exporta por separado y tú decides si compartir cualquiera de los dos archivos. En el celular, los fallos de la
app salen solos con «Contarnos en qué paso vas» encendido (ver «Fallos de la app en el celular», más abajo).

**Señales para mejorar la lectura de formatos.** En el escritorio, los interruptores están en
**Ajustes » Privacidad**, y puedes revocar cada permiso por separado. El celular no manda ni la
salud de parseo ni muestras de formatos. Sus interruptores están en **Más » Qué sale de este
celular** (**«Contarnos en qué paso vas»** y **«Leer correos con Presu IA»**) y en **Más » Correo
y extractos** (la importación automática de cada correo y **«Presu IA para los extractos que no
entiendo»**).
No todos empiezan igual, y la diferencia es a propósito:

- **Las señales anónimas vienen encendidas** y puedes apagarlas cuando quieras: la **salud
  de parseo**, los **hitos de uso** y la **lista de bancos que elegiste**. Ninguna lleva
  montos, descripciones, comercios ni números de cuenta — solo el hecho, la fecha y de qué
  banco o lector hablamos. La de bancos es distinta en un punto: no tiene interruptor en
  Ajustes, porque solo sale desde el paso de los bancos de la configuración inicial, en el
  escritorio y en el celular, y se apaga desmarcando su casilla en ese paso (ver abajo).
- **Lo que lleva contenido de tus extractos está apagado hasta que tú lo actives**: las
  **muestras de formatos**, el **procesamiento alojado** de un PDF o correo, y la **lectura
  con IA**. Esos sí mandan fragmentos de tus documentos, así que no se encienden solos.
  Quedan asociados a la versión de política que aceptaste y, si esa versión cambia, te los
  volvemos a preguntar.

El detalle de cada uno:

- **Salud de parseo (seudónima):** al leer un extracto o correo bancario, Presu envía metadatos
  del resultado — versión del lector, si funcionó, cuántos movimientos leyó y si las cuentas del
  extracto cuadraron (sí, no o no se pudo comprobar; ninguna cifra), más **una** de
  estas dos para saber de qué banco hablamos: el nombre del banco, o **la dirección de correo
  del remitente** cuando es una que agregaste a mano (es la única forma de que podamos
  publicarla para que Presu la lea en todos los equipos). Si esa dirección es de un correo
  personal —Gmail, Outlook y similares— o es una de tus propias cuentas conectadas, **no
  viaja**: se manda solo la etiqueta «dominio personal». **Nunca** montos, descripciones,
  comercios ni números de cuenta. Nos avisa cuando un banco cambia su formato, y cuáles
  todavía no sabemos leer, para arreglarlo rápido.
- **Muestras para arreglar lectores — solo si las autorizas:** cuando Presu no logra leer bien
  un extracto en PDF que elegiste en tu computador, te puede pedir permiso para mandar una
  copia de su **texto** —nunca el PDF, y nunca extractos que llegaron por tu correo— y así
  arreglar el lector de tu banco. Viene **apagado**: sin tu permiso no sale nada, y decir que
  no no cambia cómo se leen tus extractos.
  - **Qué viaja:** el texto del extracto con tu nombre, cédulas, números de cuenta y de
    tarjeta, celulares y correos tapados antes de salir, y también el nombre de otras
    personas en transferencias cuando Presu lo reconoce. Quedan montos, fechas, comercios y
    descripciones. Nuestro
    servidor vuelve a revisar el texto y lo rechaza si todavía encuentra una cédula, una
    cuenta, una tarjeta, un celular o un correo.
  - **Quién lo lee:** ninguna persona. Lo lee un programa de Presu que usa un modelo de IA de
    **Anthropic**, que lo procesa según su propia política; Presu borra de su equipo los
    registros de esa lectura. En el código de Presu solo queda un ejemplo inventado con la
    misma forma, nunca tu texto.
  - **Dónde y cuánto tiempo:** cifrado en nuestro servidor (**Cloudflare**), guardado aparte de
    los datos de tu cuenta, hasta **90 días** o hasta que el lector quede arreglado, lo que pase
    primero.
  - **Cómo lo apagas:** en Ajustes » Privacidad puedes retirar una muestra o todas, y apagar el
    permiso. Al retirarlas se bloquean de inmediato y su texto se borra en minutos.
  - Autorizas una vez; la primera muestra la ves antes de que salga, y como máximo se mandan
    cinco al día.

- **Muestras del sistema anterior:** hasta el 24 de septiembre de 2026 existió otra forma de
  aportar muestras, que suspendimos porque nuestro servidor no podía comprobar quién las
  mandaba. Esas muestras no se usan para nada y se están borrando; el plazo máximo que tenían
  era de **180 días**. Si aportaste alguna, puedes pedir su retiro en Ajustes » Privacidad, y
  las solicitudes que aún no terminaron se muestran como pendientes.
- **Hitos de uso:** una señal de una sola vez cuando alcanzas un hito de la configuración —
  completaste la configuración inicial, conectaste tu correo, lograste tu primer import,
  creaste tu primer presupuesto o categorizaste tu primer movimiento. Solo el hecho, la fecha,
  la versión de la app **y si es una versión de prueba**. Sin datos financieros. Nos permiten saber en qué paso se atascan
  las personas para mejorar (y ofrecer ayuda en) ese paso.
- **Cobros que se repiten (conteos):** desde el escritorio, como mucho una vez por semana y
  solo si cambió algo, cuántas series de cobros que se repiten te mostramos y cuántas
  marcaste como «se repite», descartaste con «no es» o dejaste sin tocar, separadas por qué
  tan seguros estábamos (alta, media o marcada a mano). Solo esos números: sin comercios,
  montos, fechas de cobro ni categorías. Nos dicen si el detector acierta fuera de nuestras
  pruebas. Viaja con los hitos de uso y se apaga con el mismo interruptor.

Los **hitos de uso** también salen de tu celular, con el mismo contenido: el hecho, la
fecha, la versión de la app **y si es una versión de prueba**. Además, el celular avisa **que se abrió**: como mucho una vez
por hora y solo con la app en pantalla, manda el id de dispositivo aleatorio, si es iPhone o
Android **y si es una versión de prueba (un simulador o una versión de desarrollo)**, y nuestro servidor anota el día. Es lo mismo que el escritorio registra al consultar
su licencia (ver «Señal de uso (mínima)»), y sirve para saber cuántas personas usan Presu en el
celular y si vuelven. Ese aviso no lleva qué pantalla abriste (eso es el recorrido, que se
explica más abajo) ni ningún dato financiero. En el celular
todo esto se apaga en **Más » Qué sale de este celular » «Contarnos en qué paso vas»**; si lo
apagas, no sale ninguno.

Estas señales viajan identificadas por el **id de dispositivo aleatorio** (no por tu nombre ni
tu correo). Si registraste tu cuenta (Beta de Pioneros o plan Pro), ese id queda asociado a tu
correo en nuestro backend — lo usamos únicamente para entender y acompañar tu experiencia de
uso, nunca para publicidad ni para compartirlo con terceros.

**Por qué pantallas pasas en el celular.** Con «Contarnos en qué paso vas» encendido, el celular
anota también el **recorrido**: el nombre de cada pantalla que abres («Movimientos», «el detalle
de un movimiento», «Tu deuda»), en qué orden y a qué hora, agrupado en sesiones (una sesión se
corta cuando la app pasa más de 30 minutos en el fondo). Es solo el nombre de la pantalla:
**nunca** cuál movimiento, cuenta o categoría abriste, ni montos, comercios, lo que buscaste o lo
que escribiste. Viaja como las señales de arriba, con el id de dispositivo aleatorio, y sirve para
saber qué partes de la app se usan y dónde se pierde la gente. Lo guardamos **90 días** y después
se borra solo; si borras tu cuenta, se borra con ella. Si apagas el interruptor, no se anota nada
más y lo que todavía no había salido de tu celular se borra ahí mismo.

**Fallos de la app en el celular.** Con «Contarnos en qué paso vas» encendido, cuando algo de la
app falla el celular anota el **error técnico**: su tipo («TypeError»), el mensaje, en qué parte del
código pasó, en qué pantalla (solo su nombre, como en el recorrido), la versión de la app, si es
iPhone o Android y cuántas veces se repitió. Antes de guardarlo, el celular le quita al mensaje las
cifras de tres dígitos o más, los correos, las direcciones web, las rutas de archivos y todo texto
entre comillas que no sea un nombre de código; nuestro servidor lo vuelve a limpiar al recibirlo.
**Nunca** viajan montos, comercios, cuentas ni lo que escribiste. Viaja con el id de dispositivo
aleatorio y sirve para arreglar lo que se rompe aunque no nos escribas. Lo guardamos **30 días** y
después se borra solo; si borras tu cuenta, se borra con ella. Si apagas el interruptor, no se
anota nada más y lo que todavía no había salido de tu celular se borra ahí mismo.

**Tu mes completo se calcula con dos de estos datos.** Al instalar Presu tienes un mes con
todas las funciones, sin tarjeta y sin darnos tu correo. Para saber cuándo empieza y cuándo
termina, nuestro servidor usa dos cosas que ya conoce y que están descritas arriba: el **id de
dispositivo aleatorio** y la **fecha de tu primer import**. No se recoge ninguna señal nueva y
no sale ningún dato financiero: es el mismo dato, usado además para reconocer un derecho.

> **Consecuencia que preferimos decirte:** si apagas los **hitos de uso** (Ajustes » Privacidad),
> tu equipo no nos informa la fecha de tu primer import, y sin esa fecha no podemos calcular tu
> mes completo. Apagarlos es siempre tu decisión y nada de lo que ya importaste se pierde.

## Originales locales y retención

Cuando importas un extracto en escritorio —un PDF que eliges, un adjunto que llega a tu correo o el
texto de un correo de aviso de tu banco (asunto, remitente y cuerpo)—, Presu conserva una copia
completa cifrada en la carpeta privada de la aplicación para poder reintentar formatos desconocidos
o documentos con contraseña. La política inicial es de **365 días** y puede configurarse entre 1 y
365 días. SQLite conserva la identidad, el historial de intentos y el estado (`disponible`,
`vencido` o `faltante`) sin sincronizar el archivo original. Cambiar el plazo muestra cuándo
perderás la posibilidad de reprocesar sin volver a aportar el PDF. Los backups de SQLite no
contienen esos originales: al restaurar uno se eliminan las copias locales anteriores. Para releer
un PDF que elegiste a mano tendrás que volver a elegirlo; los adjuntos de tu correo que seguían
pendientes se vuelven a descargar solos en la siguiente sincronización.

**Cómo se cifra.** Cada original se cifra con AES-256-GCM y queda atado a su documento: no se puede
cambiar por otro. La llave es aleatoria, de este equipo, y no se guarda en claro: la protege el
llavero del sistema (el Llavero de macOS, DPAPI en Windows, o libsecret/KWallet en Linux). Los
originales que ya tenías, guardados con el método anterior, se pasan a este de a poco cada vez que
abres la app.

**Sin llavero, no se guarda el original.** Si el llavero del sistema no está disponible —por
ejemplo, en Linux sin un llavero configurado—, Presu lee el extracto igual, en memoria, pero no
conserva el original: para releerlo tendrás que volver a elegirlo.

**Si el llavero pierde la llave** —por ejemplo, al reinstalar el sistema o borrar su entrada—, los
originales cifrados con ella dejan de abrirse. Presu usa una llave nueva para los siguientes; los
anteriores se reemplazan cuando vuelves a elegir el PDF, y los que no, se eliminan al vencer su
plazo.

**Correos de acompañamiento:** si registraste tu cuenta, podemos enviarte correos puntuales de
acompañamiento durante tu configuración — por ejemplo, "tu primer resumen está listo" tras tu
primer import, o una guía si un paso quedó a medias. Se dirigen usando **únicamente los hitos y
la señal de uso descritos arriba** (jamás tus datos financieros), tienen un tope de frecuencia
(máximo uno cada varios días) y **cada correo trae un enlace para darte de baja**; también puedes
pedirla respondiendo cualquiera de estos correos. Para no repetirte y saber si de verdad ayudan,
registramos qué correo te enviamos (con su id de entrega) — y una fracción de usuarios no los
recibe, como grupo de comparación. Darte de baja no afecta los correos de servicio (tu licencia,
tus pagos).

**Señal de bancos (seudónima):** Desde el paso de los bancos de la configuración inicial, en el
escritorio y en el celular, Presu envía, asociada al id de dispositivo aleatorio, los bancos que
marcaste y la versión de la app, para priorizar qué extractos y correos soportar primero. En el
escritorio incluye los que escribas en "Otro"; el celular no tiene dónde escribirlos, así que
"Otro" no se envía. Es **solo el nombre del banco**: sin datos financieros, sin números de cuenta
y sin tu correo. La casilla que lo permite, en ese paso, **viene marcada**. Si la desmarcas, no se
envía nada y tu «no» queda guardado en ese aparato, así que tampoco sale si vuelves a hacer el
recorrido de bienvenida (en el escritorio, desde Ajustes » Ayuda; en el celular, desde Más › Volver
a ver la guía), ni, en el celular, después de «Borrar los datos de este celular». Con la casilla
marcada, en el escritorio sale cada vez que terminas la configuración; en el celular, al tocar
«Seguir» en ese paso con algún banco de la lista marcado (saltar el paso no envía nada). Contamos
uno solo por id de dispositivo al mes.

**Enlaces de descarga (analítica web anónima):** cuando alguien abre uno de nuestros enlaces públicos
de descarga del instalador, nuestro backend (Cloudflare) cuenta el clic de forma **agregada y anónima**
— la plataforma del instalador (macOS/Windows), el tipo de dispositivo (móvil/tablet/escritorio) y el
sistema operativo deducidos del navegador, y el país (código de 2 letras). **No** guardamos el navegador
completo (User-Agent), ni la dirección IP, ni tu correo, ni ningún identificador de persona: son solo
totales para entender la demanda (por ejemplo, cuánta gente intenta descargar desde el celular). No está
ligado a ninguna cuenta.

## Aportes de documentos (programa «Sembradores»)

En [presu.io/aporta](https://presu.io/aporta) puedes aportar, de forma **voluntaria y anónima**, un
extracto o un pantallazo de transacciones para ayudarnos a que Presu aprenda a leer más bancos.
Cómo cuidamos tu privacidad:

- El documento se **anonimiza en tu propio navegador**: las zonas que tapas se eliminan de los
  píxeles y el archivo original (PDF o imagen) **nunca se sube**. Viajan la imagen ya tapada y
  aplanada, sin metadatos, y **el texto que quedó a la vista** después de tapar —cada palabra con su
  posición en la página—, para entender cómo están armadas sus columnas. Lo que tapas no viaja ni
  en la imagen ni en el texto.
- Guardamos esa **imagen anonimizada**, ese **texto** y datos no personales del formato: **país,
  banco, producto, moneda y tipo** de documento. No pedimos tu identidad; nombre y correo son
  **opcionales** (solo si quieres aparecer en el Muro o que te contactemos).
- Usamos los aportes **únicamente** para mejorar la lectura de formatos bancarios. No los
  compartimos con terceros ni los usamos con otro fin.
- Como el dato se entrega **anonimizado**, no constituye dato personal. Si dejaste tu correo y
  quieres que borremos tu aporte, escríbenos (ver Contacto) y lo hacemos en máximo **15 días
  hábiles**.

## Tus controles

- Puedes desconectar tus correos (Ajustes » Correo y extractos) y quitar tu licencia de este
  equipo (Ajustes » Cuenta y plan) en cualquier momento.
- Puedes cambiar o quitar tu clave de OpenAI u OpenRouter en cualquier momento (Ajustes » Presu
  IA » Claves guardadas en este equipo). Al quitarla se borra de este equipo.
- En el celular, **«Leer fotos con Presu IA»** y **«Leer correos con Presu IA»** se apagan en
  Más » Qué sale de este celular.
- Puedes borrar tus movimientos o dejar Presu como nuevo desde Ajustes » Tus datos » Borrar.
- Puedes **borrar tu cuenta** desde la app (ver "Borrar tu cuenta"). Si pagas una suscripción,
  puedes cancelar la renovación en Ajustes » Cuenta y plan, o escribirnos (ver Contacto).
- Al desinstalar, elimina también `~/Library/Application Support/Presu/` para borrar tus datos
  locales.

## Contacto

Para dudas de privacidad o para ejercer tus derechos (acceso, actualización, supresión),
escribe a **soporte@presu.io** o abre un issue en el repositorio del proyecto.

## Notificaciones bancarias en Android

Esta función empieza apagada y requiere que la actives y concedas acceso a notificaciones
con los ajustes de Android. El permiso del sistema abarca todas las aplicaciones; Presu
filtra primero por las fuentes elegidas: Nu (`com.nu.production`), Google Wallet
(`com.google.android.apps.walletnfcrel`) y Google Mensajes o Mensajes de Samsung.
Google Wallet y los remitentes de Mensajes empiezan sin activar; una autorización anterior
para Nu no los enciende. En Mensajes, comprueba que el título coincida exactamente con un
número elegido antes de leer el cuerpo. Omite códigos de seguridad identificables.
No solicita permisos de lectura directa de SMS ni lee historiales de mensajes o billeteras.
Captura solo avisos nuevos desde la activación de cada fuente/remitente. El texto oculto
por Android, un contacto con nombre o una app que no emite avisos pueden impedir la captura.
Quitar una fuente o número detiene sus entregas nuevas y conserva los pendientes.

El título, el cuerpo y la hora del aviso se guardan en este teléfono. Mientras Presu está
cerrado, esperan en una cola cifrada con una llave del Android Keystore, fuera de las copias
del sistema. Al abrir Presu se copian a su base local (sin cifrar, como los demás datos
financieros) y se retiran de la cola después de confirmar la escritura. No se envían a IA,
telemetría ni a los servidores de Presu. Cuando confirmas o descartas el aviso, se elimina
su texto crudo; se conserva su identidad para no procesar de nuevo la misma entrega.

Cada aviso requiere revisión y una cuenta elegida. Solo los movimientos que confirmes
pueden sincronizarse, cifrados de extremo a extremo, con tus otros dispositivos. Apagar
la captura detiene avisos nuevos; puedes revisar o descartar los ya recibidos. Borrar los
datos de este celular borra también la bandeja y desactiva su cola nativa.

## Avisos entregados por Atajos en iPhone

La recepción empieza apagada. Para recibir avisos nuevos automáticamente, activa la función
y crea en Atajos una automatización por notificación de las apps bancarias que elijas
(requiere iOS 27; un mismo evento permite varias apps), o por Mensaje de los remitentes
bancarios que selecciones. Para SMS, la acción «Recibir SMS bancario» recibe el texto original;
para notificaciones, «Recibir aviso bancario» recibe título, subtítulo y cuerpo. Presu no lee
el historial de mensajes ni inspecciona otras apps, y no verifica qué app o remitente originó
el texto. Revisa siempre la operación y elige la cuenta.
Un permiso anterior, incluso el de recepción bancaria, no autoriza el alcance con SMS:
debes volver a activar la recepción. Los avisos pendientes se conservan.
La lectura común propone operaciones en COP; no garantiza entender todos los formatos ni bancos.

Para ayudarte a comprobar la configuración, guarda localmente la hora de la última recepción
con texto y si el último intento llegó vacío. Esas marcas no incluyen contenido financiero,
no se sincronizan ni se envían. Una recepción no prueba que provino de una notificación real.

La acción guarda cada entrega en una cola AES-GCM local, en el App Group de esta instalación,
excluida del respaldo. Su llave permanece en el llavero, solo en este dispositivo; después
del primer desbloqueo permite guardar también con el teléfono bloqueado. No transmite
contenido por enlaces, IA, registros, telemetría ni servidores. Al abrir Presu se aplica
la misma revisión, eliminación del texto y sincronización cifrada descritas arriba.
Apagar la función rechaza entregas nuevas; borrar los datos elimina los avisos de esta
instalación y apaga la recepción. Atajos puede seguir intentando ejecutarla: desactiva
también tu automatización si ya no quieres usarla.

El recorrido anónimo de pantallas puede incluir la apertura de Notificaciones bancarias.
Solo registra el nombre de la pantalla, bajo el interruptor de hitos de uso; nunca el texto de los avisos.
