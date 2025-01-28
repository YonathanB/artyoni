Voici un pipeline complet avec la ligne de calcul du delta_time ajoutée. Le delta_time représente l’écart entre system_time (l'heure d'entrée dans le système) et camera_time (l'heure de la photo prise par la caméra).

Code complet en PySpark :

from pyspark.sql import functions as F

# Charger les données
data = spark.createDataFrame([
    (1, "A", "2025-01-27 10:00:00", "2025-01-27 10:00:00", 35.678, -78.123),
    (1, "B", "2025-01-27 10:05:00", "2025-01-27 10:05:00", 35.679, -78.124),
    (2, "A", "2025-01-27 10:01:00", "2025-01-27 10:02:00", 35.690, -78.200),
    (2, "C", "2025-01-27 10:06:00", "2025-01-27 10:08:00", 35.691, -78.201),
    (3, "A", "2025-01-27 10:02:00", "2025-01-27 10:03:00", 35.700, -78.300),
    (3, "B", "2025-01-27 10:20:00", "2025-01-27 10:30:00", 35.701, -78.301)
], ["camera_id", "object_id", "camera_time", "system_time", "x", "y"])

# Convertir les colonnes de temps en type timestamp
data = data.withColumn("camera_time", F.to_timestamp("camera_time")) \
           .withColumn("system_time", F.to_timestamp("system_time"))

# Calculer le delta_time (en secondes)
data = data.withColumn("delta_time", F.col("system_time").cast("long") - F.col("camera_time").cast("long"))

# Calculer les bornes avec IQR
bounds = data.approxQuantile("delta_time", [0.25, 0.75], 0.01)
q1, q3 = bounds
iqr = q3 - q1
lower_bound = q1 - 1.5 * iqr
upper_bound = q3 + 1.5 * iqr

# Filtrer les données pour exclure les outliers
filtered_data = data.filter((F.col("delta_time") >= lower_bound) & (F.col("delta_time") <= upper_bound))

# Calculer la médiane par caméra
median_stats = filtered_data.groupBy("camera_id").agg(
    F.expr('percentile_approx(delta_time, 0.5)').alias("median_delta_time")
)

# Joindre les statistiques et corriger les anomalies
corrected_data = data.join(median_stats, "camera_id").withColumn(
    "corrected_camera_time",
    F.when(F.abs(F.col("delta_time")) > upper_bound, F.col("system_time") - F.col("median_delta_time"))
    .otherwise(F.col("camera_time"))
)

# Afficher les données corrigées
corrected_data.select("camera_id", "object_id", "camera_time", "system_time", "delta_time", 
                      "median_delta_time", "corrected_camera_time").show(truncate=False)


---

Sortie attendue après exécution :


---

Explications des étapes clés :

1. delta_time :

Calculé comme la différence en secondes entre system_time et camera_time.

Exemples :

Si les deux temps sont identiques, delta_time = 0.

Si system_time est plus tard que camera_time, delta_time est positif.




2. Filtrage des outliers :

Les valeurs de delta_time en dehors des bornes définies par IQR (ex., très grands écarts) sont exclues.



3. Correction avec la médiane :

Les camera_time identifiés comme anormaux sont recalés en utilisant system_time - median_delta_time.



4. Données corrigées :

Les anomalies sont corrigées tout en conservant les camera_time valides tels quels.





---

Avec cette approche, tu minimises l’influence des valeurs extrêmes et tu garantis des corrections robustes. Si tu veux approfondir une étape ou ajouter une vérification supplémentaire, fais-le-moi savoir !




eMerci pour la précision ! Voici une version du fichier .eslintrc.json correctement formatée et lisible 
---

Fichier .eslintrc.json corrigé et lisible

{
  "root": true,
  "ignorePatterns": ["node_modules", "dist", "tmp"],
  "overrides": [
    {
      "files": ["*.ts", "*.tsx"],
      "extends": [
        "eslint:recommended",
        "plugin:@typescript-eslint/recommended",
        "plugin:import/errors",
        "plugin:import/warnings",
        "plugin:import/typescript",
        "plugin:@nx/nx"
      ],
      "plugins": ["@typescript-eslint", "import"],
      "parser": "@typescript-eslint/parser",
      "parserOptions": {
        "project": ["tsconfig.*?.json"]
      },
      "rules": {
        "import/no-extraneous-dependencies": [
          "error",
          {
            "devDependencies": [
              "**/*.spec.ts",
              "**/*.test.ts",
              "jest.config.ts",
              "karma.conf.js",
              "webpack.config.js"
            ]
          }
        ],
        "import/order": [
          "error",
          {
            "groups": ["builtin", "external", "internal", "parent", "sibling", "index"],
            "newlines-between": "always"
          }
        ],
        "import/no-cycle": ["error", { "maxDepth": 2 }],
        "import/no-relative-parent-imports": "error",
        "@typescript-eslint/no-unused-vars": ["error"],
        "@typescript-eslint/explicit-module-boundary-types": "off",
        "@nx/enforce-module-boundaries": [
          "error",
          {
            "enforceBuildableLibDependency": true,
            "allow": [],
            "depConstraints": [
              {
                "sourceTag": "type:app",
                "onlyDependOnLibsWithTags": ["type:feature", "type:shared"]
              },
              {
                "sourceTag": "type:feature",
                "onlyDependOnLibsWithTags": ["type:shared"]
              }
            ]
          }
        ]
      }
    },
    {
      "files": ["*.html"],
      "extends": ["plugin:@angular-eslint/template/recommended"],
      "rules": {}
    },
    {
      "files": ["*.component.ts"],
      "extends": ["plugin:@angular-eslint/recommended"],
      "rules": {}
    }
  ]
}


---

Clés pour rendre le fichier lisible :

1. Indentation cohérente : Chaque niveau est aligné avec 2 espaces pour améliorer la lisibilité.


2. Séparation claire :

Les fichiers .ts, .html, et .component.ts sont bien isolés dans des sections spécifiques.



3. Pas d'espaces inutiles ou de lignes superflues.




---

Si le format est encore incorrect :

Installez et utilisez Prettier pour formater automatiquement ce fichier JSON :

npm install --save-dev prettier eslint-config-prettier

Puis exécutez :

npx prettier --write .eslintrc.json


Cela permettra de maintenir automatiquement un formatage propre. Dis-moi si ce fichier correspond à tes attentes !

