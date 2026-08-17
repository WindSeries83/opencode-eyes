# opencode-eyes

Un plugin OpenCode qui donne la vision automatiquement à chaque agent, quel que soit le modèle utilisé.

Si un agent reçoit une image alors que son modèle actuel ne voit pas, le plugin détecte l'échec et
rejoue silencieusement le message sur le modèle suivant d'une chaîne de repli triée par coût — le
modèle avec vision le moins cher d'abord, en montant en gamme uniquement en cas d'échec. Pas de
changement de modèle manuel, pas d'« agent vision » dédié à appeler.

> 🇬🇧 [Read in English](README.md)

## Comment ça marche

1. À chaque message entrant, le plugin vérifie les pièces jointes à la recherche d'une image (`mime`
   commençant par `image/`).
2. S'il en trouve une, il marque la session comme « vision en attente ».
3. Si OpenCode signale une `session.error` pour cette session, le plugin cherche parmi vos
   fournisseurs **connectés** tous les modèles capables d'accepter des images, les trie par coût
   d'entrée, et renvoie le même message via `client.session.prompt()` sur le modèle suivant de la
   liste.
4. Il s'arrête quand la chaîne est épuisée ou après `maxAttempts`.

La capacité vision est détectée depuis les données live des fournisseurs (`attachment: true`,
`modalities.input` contenant `"image"`, ou `capabilities.input.image` en mode hérité). Rien n'est
codé en dur : la chaîne reflète toujours les fournisseurs réellement configurés et authentifiés
dans OpenCode.

## Installation

### Depuis npm (recommandé)

```jsonc
// opencode.jsonc
{
  "plugin": ["opencode-eyes"]
}
```

### En local (test, sans publier)

Déposez un fichier loader dans le répertoire global des plugins d'OpenCode :

`~/.config/opencode/plugins/eyes.js`
```js
export { VisionRouterPlugin } from "file:///chemin/absolu/vers/opencode-eyes/dist/index.js";
```

Puis `npm install && npm run build` dans ce dépôt. OpenCode charge automatiquement tout fichier
`.js`/`.ts` placé dans `~/.config/opencode/plugins/` au démarrage — aucune modification de config
nécessaire.

## Configuration

Le `VisionRouterPlugin` par défaut ne nécessite aucune configuration. Pour un contrôle fin,
enregistrez le plugin programmatiquement avec des options :

```ts
// my-plugin.ts
import { createVisionRouter } from "opencode-eyes";

export const VisionRouterPlugin = createVisionRouter({
  maxAttempts: 3,               // max de renvois de repli par image (défaut 4)
  maxCost: 5,                   // ignore les modèles dont le coût d'entrée dépasse ce montant (défaut : sans limite)
  preferProviders: ["groq"],    // route les modèles de ces fournisseurs en premier, ordre de coût conservé (défaut : [])
  excludeProviders: ["local"],  // ne jamais router vers ces fournisseurs (défaut : [])
  excludeModels: ["openai/gpt-4o", "claude-sonnet"], // id seul ou "providerID/modelID" (défaut : [])
  cacheMs: 300_000,             // durée de mise en cache de la chaîne de modèles (défaut 5 min)
  debug: false,                 // journalise les décisions de routage sur stderr (défaut false)
});
```

## Développement

```sh
npm install
npm test            # tests unitaires (vitest)
npm run typecheck   # vérification des types src + tests
npm run build       # compilation vers dist/
```

### Vérification de bout en bout

Avec le plugin chargé dans un serveur OpenCode en cours d'exécution :

```sh
OPENCODE_URL=http://127.0.0.1:10999 node scripts/e2e.mjs
```

Le script génère un PNG d'exemple, l'envoie dans une session fraîche, attend la réponse de
l'assistant et affiche quel modèle l'a traitée — vous devriez voir un modèle avec vision si votre
modèle configuré ne voit pas les images.

## Notes de comportement

- Si un renvoi échoue lui-même (fournisseur indisponible, requête invalide), le plugin arrête de
  router cette session plutôt que de réessayer à l'aveugle.
- Les fournisseurs listés dans `preferProviders` passent toujours en premier dans la chaîne, du
  moins cher au plus cher dans le groupe. Pratique pour les offres gratuites (ex. Groq) : les
  modèles gratuits sont essayés avant tout repli payant.
- Les `session.error` concurrentes pour la même session sont dédupliquées.
- La limite `maxAttempts` s'applique par message avec image ; un nouveau message avec image
  réarme l'état « en attente ».

## Licence

MIT
