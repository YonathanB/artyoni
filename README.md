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
