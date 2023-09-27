# artyoni
from pyspark.sql import SparkSession
from pyspark.sql.window import Window
from pyspark.sql import functions as F

# Create a Spark session
spark = SparkSession.builder.appName("DuplicateLicensePlates").getOrCreate()

# Assuming you have a DataFrame called "df" with columns: license_plate, latitude, longitude, and picture_date
# You can read your data into a DataFrame like this:
# df = spark.read.csv("your_input_file.csv", header=True, inferSchema=True)

# Define a window specification for partitioning by license_plate and ordering by picture_date
window_spec = Window.partitionBy("license_plate").orderBy("picture_date")

# Calculate the lagged latitude, longitude, and timestamp
df = df.withColumn("prev_lat", F.lag("latitude").over(window_spec))
df = df.withColumn("prev_lon", F.lag("longitude").over(window_spec))
df = df.withColumn("prev_timestamp", F.lag("timestamp").over(window_spec))

# Calculate the time difference in seconds and distance in meters
df = df.withColumn("time_diff_seconds", F.unix_timestamp("picture_date") - F.unix_timestamp("prev_timestamp"))
df = df.withColumn("distance_meters", F.sqrt((F.col("latitude") - F.col("prev_lat"))**2 + (F.col("longitude") - F.col("prev_lon"))**2) * 111.32 * 1000)

# Filter rows where time difference > 0 and speed > 300 km/h
duplicated_license_plates = df.filter((F.col("time_diff_seconds") > 0) & (F.col("distance_meters") / F.col("time_diff_seconds") * 3.6 > 300)).select("license_plate").distinct()

# Create a new DataFrame with the results
result_df = spark.createDataFrame(duplicated_license_plates)

# Save the results to a new table
result_df.write.saveAsTable("new_table_name")

# Stop the Spark session
spark.stop()
