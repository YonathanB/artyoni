from pyspark.sql import SparkSession
from pyspark.sql import functions as F
from pyspark.sql.window import Window
from pyspark.sql.types import ArrayType, StructType, StructField, FloatType, StringType

# Initialisez une session Spark
spark = SparkSession.builder.appName("Exemple PySpark").getOrCreate()

# Load your DataFrame from Hadoop
# Replace "your/hadoop/path" with the actual Hadoop path to your data
my_table = spark.read.parquet("your/hadoop/path")

# Define the schema for the JSON array
json_array_schema = ArrayType(StructType([
    StructField("latitude", FloatType()),
    StructField("longitude", FloatType()),
    StructField("time", StringType())
]))

# Define a UDF to update the JSON array based on a condition
@F.udf(json_array_schema)
def update_json_array(latitude, longitude, time, previous_json_array):
    if condition_met(latitude, longitude, time):
        return F.concat(previous_json_array, F.array(F.struct(latitude, longitude, time)))
    else:
        return previous_json_array

# Define a window specification to access the previous row's value
window_spec = Window().orderBy("time")

# Apply the UDF to update the JSON array column
my_table = my_table.withColumn("json_array", F.array())
my_table = my_table.withColumn("updated_json_array", update_json_array("latitude", "longitude", "time", F.lag("json_array").over(window_spec)))

# Show the results
my_table.show(truncate=False)
from pyspark.sql import SparkSession
from pyspark.sql import functions as F
from pyspark.sql import Window

# Créer une session Spark
spark = SparkSession.builder.appName("example").getOrCreate()

# Charger les données dans un DataFrame
data = [
    (1, 48.8566, 2.3522, "2023-01-01 12:00:00"),
    (1, 48.8588, 2.2944, "2023-01-01 12:30:00"),
    (1, 48.8599, 2.3130, "2023-01-01 13:00:00"),
    (2, 49.8566, 3.3522, "2023-01-01 12:00:00"),
    (2, 49.8588, 3.2944, "2023-01-01 12:30:00"),
    (2, 49.8599, 3.3130, "2023-01-01 13:00:00"),
    # ... Ajoutez vos données ici
]

columns = ["id", "latitude", "longitude", "timestamp"]

df = spark.createDataFrame(data, columns)

# Convertir la colonne timestamp en format de date
df = df.withColumn("timestamp", F.to_timestamp(df["timestamp"]))

# Créer une fenêtre de partitionnement par id et trier par timestamp pour l'ordre chronologique
window_spec = Window.partitionBy("id").orderBy("timestamp")

# Ajouter des colonnes pour la latitude et la longitude précédentes
df = df.withColumn("prev_lat", F.lag("latitude").over(window_spec))
df = df.withColumn("prev_lon", F.lag("longitude").over(window_spec))

# Calculer la distance entre les points
df = df.withColumn(
    "distance",
    F.acos(
        F.sin(F.radians("latitude")) * F.sin(F.radians("prev_lat"))
        + F.cos(F.radians("latitude"))
        * F.cos(F.radians("prev_lat"))
        * F.cos(F.radians("prev_lon") - F.radians("longitude"))
    )
    * 6371  # 6371 est le rayon moyen de la Terre en kilomètres
)

# Marquer les changements de groupe
df = df.withColumn(
    "group_change",
    F.when(F.lag("distance").over(window_spec).isNull(), 0)
    .when(F.lag("distance").over(window_spec) > 100, 1)
    .otherwise(0),
)

# Cumulative sum pour attribuer un groupe aux changements de groupe
df = df.withColumn(
    "group",
    F.sum("group_change").over(window_spec),
)

# Supprimer les colonnes auxiliaires
df = df.drop("prev_lat", "prev_lon", "group_change", "distance")

# Afficher le résultat
df.show()
