from pyspark.sql import SparkSession, DataFrame, Window
from pyspark.sql.functions import *
from pyspark.sql.types import *
from datetime import datetime, timedelta
from dataclasses import dataclass
from typing import Dict, List, Tuple
import logging

@dataclass
class DetectionConfig:
    """Configuration pour la détection d'anomalies"""
    min_camera_score: float = 0.6
    min_model_detection_score: float = 0.5
    min_sequence_count: int = 10
    long_absence_days: int = 90
    registration_expired_days: int = 365
    min_cameras_for_validation: int = 2
    daylight_hours: Tuple[int, int] = (6, 20)

class DetectionScoreCalculator:
    def __init__(self, spark: SparkSession, config: DetectionConfig):
        self.spark = spark
        self.config = config
        self.logger = logging.getLogger(self.__class__.__name__)

    def calculate_camera_scores(self, start_date: str, end_date: str) -> DataFrame:
        """Calcule les scores des caméras sur une période donnée"""
        self.logger.info(f"Calculating camera scores for period {start_date} to {end_date}")
        
        data = self.spark.table("spotts").filter(
            (col("date") >= start_date) & (col("date") <= end_date)
        ).join(
            self.spark.table("visint"), "spott_id"
        ).join(
            self.spark.table("vehicles"), 
            col("plate_number") == col("lpr")
        ).withColumn(
            "is_daylight",
            (hour("timestamp") >= lit(self.config.daylight_hours[0])) & 
            (hour("timestamp") < lit(self.config.daylight_hours[1]))
        )
        
        camera_scores = data.groupBy("camera_id", "is_daylight").agg(
            # Scores make
            count(when(col("make") == col("mmr_make"), 1)).alias("correct_make"),
            count(when(col("make").isNotNull(), 1)).alias("total_make"),
            
            # Scores model quand make correct
            count(when((col("make") == col("mmr_make")) & 
                      (col("model") == col("mmr_model")), 1)).alias("correct_make_model"),
            count(when((col("make") == col("mmr_make")) & 
                      col("model").isNotNull(), 1)).alias("total_make_model"),
            
            # Scores couleur
            count(when(col("color") == col("detected_color"), 1)).alias("correct_color"),
            count(when(col("color").isNotNull(), 1)).alias("total_color"),
            
            # Méta-données
            min("timestamp").alias("period_start"),
            max("timestamp").alias("period_end"),
            count("*").alias("total_detections")
        ).withColumn(
            "make_score",
            when(col("total_make") > 0, 
                 col("correct_make") / col("total_make")
            ).otherwise(0.0)
        ).withColumn(
            "model_score",
            when(col("total_make_model") > 0,
                 col("correct_make_model") / col("total_make_model")
            ).otherwise(0.0)
        ).withColumn(
            "color_score",
            when(col("total_color") > 0,
                 col("correct_color") / col("total_color")
            ).otherwise(0.0)
        ).withColumn("calculation_date", current_date())
        
        # Sauvegarder les résultats
        camera_scores.write \
            .format("delta") \
            .mode("append") \
            .partitionBy("calculation_date") \
            .saveAsTable("camera_detection_scores")
            
        return camera_scores

    def calculate_model_detection_scores(self, start_date: str, end_date: str) -> DataFrame:
        """Calcule les scores de détection par make/model"""
        self.logger.info(f"Calculating model detection scores for period {start_date} to {end_date}")
        
        data = self.spark.table("visint").filter(
            (col("date") >= start_date) & (col("date") <= end_date)
        ).join(
            self.spark.table("vehicles"), 
            col("plate_number") == col("lpr")
        ).withColumn(
            "is_daylight",
            (hour("timestamp") >= lit(self.config.daylight_hours[0])) & 
            (hour("timestamp") < lit(self.config.daylight_hours[1]))
        )
        
        model_scores = data.groupBy("mmr_make", "mmr_model", "is_daylight").agg(
            count("*").alias("total_detections"),
            avg("mmr_score").alias("avg_confidence"),
            count(when(col("make") == col("mmr_make"), 1)).alias("correct_make"),
            count(when((col("make") == col("mmr_make")) & 
                      (col("model") == col("mmr_model")), 1)).alias("correct_make_model")
        ).withColumn(
            "make_score",
            when(col("total_detections") > 0,
                 col("correct_make") / col("total_detections")
            ).otherwise(0.0)
        ).withColumn(
            "model_score",
            when(col("total_detections") > 0,
                 col("correct_make_model") / col("total_detections")
            ).otherwise(0.0)
        ).withColumn("calculation_date", current_date())
        
        # Sauvegarder les résultats
        model_scores.write \
            .format("delta") \
            .mode("append") \
            .partitionBy("calculation_date") \
            .saveAsTable("model_detection_scores")
        
        return model_scores

    def validate_camera_sequences(self, spotts_df: DataFrame) -> DataFrame:
        """Valide les séquences de caméras"""
        window = Window.partitionBy("lpr").orderBy("timestamp")
        
        sequences = spotts_df.withColumn(
            "prev_camera",
            lag("camera_id").over(window)
        ).withColumn(
            "time_diff",
            col("timestamp").cast("long") - 
            lag("timestamp").over(window).cast("long")
        )
        
        valid_sequences = sequences.filter(col("prev_camera").isNotNull()) \
            .groupBy("prev_camera", "camera_id").agg(
                count("*").alias("sequence_count"),
                avg("time_diff").alias("avg_time_diff"),
                stddev("time_diff").alias("stddev_time_diff")
            ).withColumn(
                "is_valid_sequence",
                (col("sequence_count") >= self.config.min_sequence_count) &
                (col("stddev_time_diff") < 3600)  # variation max 1 heure
            )
        
        return valid_sequences

class VehicleAnomalyDetector:
    def __init__(self, spark: SparkSession, config: DetectionConfig = None):
        self.spark = spark
        self.config = config or DetectionConfig()
        self.score_calculator = DetectionScoreCalculator(spark, self.config)
        self.logger = logging.getLogger(self.__class__.__name__)

    def calculate_most_probable_visual_data(self, 
                                          lpr_data: DataFrame,
                                          camera_scores: DataFrame,
                                          model_scores: DataFrame,
                                          valid_sequences: DataFrame) -> DataFrame:
        """Calcule les données visuelles les plus probables"""
        lpr_window = Window.partitionBy("lpr")
        
        # Agréger les détections par LPR
        value_counts = lpr_data.groupBy(
            "lpr", "mmr_make", "mmr_model", "detected_color"
        ).agg(
            count("*").alias("value_occurrence"),
            countDistinct("camera_id").alias("distinct_cameras"),
            avg("mmr_score").alias("avg_mmr_score"),
            collect_set("camera_id").alias("camera_list"),
            count(when(col("mmr_model").isNull(), 1)).alias("make_only_detections"),
            count(when(col("mmr_model").isNotNull(), 1)).alias("full_detections")
        )
        
        # Valider les séquences
        lpr_sequences = lpr_data.join(valid_sequences, ["prev_camera", "camera_id"], "left") \
            .groupBy("lpr").agg(
                count(when(col("is_valid_sequence"), 1)).alias("valid_sequences"),
                count("*").alias("total_sequences")
            ).withColumn(
                "sequence_validity_score",
                when(col("total_sequences") > 0,
                     col("valid_sequences") / col("total_sequences")
                ).otherwise(0.0)
            )
        
        # Calculer les probabilités
        probable_data = value_counts.join(lpr_sequences, "lpr") \
            .join(camera_scores, "camera_id") \
            .join(model_scores, ["mmr_make", "mmr_model"], "left") \
            .withColumn(
                "make_probability",
                (col("value_occurrence") / max("value_occurrence").over(lpr_window) * 0.25 +
                 col("distinct_cameras") / max("distinct_cameras").over(lpr_window) * 0.25 +
                 col("sequence_validity_score") * 0.2 +
                 col("avg_mmr_score") * col("make_score") * 0.3)
            ).withColumn(
                "model_probability",
                when(col("mmr_model").isNotNull(),
                     (col("full_detections") / max("full_detections").over(lpr_window) * 0.25 +
                      col("distinct_cameras") / max("distinct_cameras").over(lpr_window) * 0.25 +
                      col("sequence_validity_score") * 0.2 +
                      col("avg_mmr_score") * col("model_score") * 0.3)
                ).otherwise(0.0)
            ).withColumn(
                "is_reliable",
                (col("distinct_cameras") >= self.config.min_cameras_for_validation) &
                (col("sequence_validity_score") > 0.5) &
                (col("make_probability") > 0.6) &
                (when(col("mmr_model").isNotNull(),
                      col("model_probability") > 0.6
                ).otherwise(true))
            )
        
        return probable_data.filter(col("is_reliable"))

    def detect_anomalies(self, date: str) -> DataFrame:
        """Détecte les anomalies avec validation multiple"""
        self.logger.info(f"Starting anomaly detection for date: {date}")
        
        # Calculer les scores sur la semaine précédente
        end_date = datetime.strptime(date, "%Y-%m-%d")
        start_date = end_date - timedelta(days=7)
        start_date_str = start_date.strftime("%Y-%m-%d")
        
        camera_scores = self.score_calculator.calculate_camera_scores(start_date_str, date)
        model_scores = self.score_calculator.calculate_model_detection_scores(start_date_str, date)
        
        # Charger les données du jour
        spotts_df = self.spark.table("spotts").filter(col("date") == date)
        visint_df = self.spark.table("visint").filter(col("date") == date)
        vehicles_df = self.spark.table("vehicles")
        
        valid_sequences = self.score_calculator.validate_camera_sequences(spotts_df)
        probable_visuals = self.calculate_most_probable_visual_data(
            visint_df, camera_scores, model_scores, valid_sequences
        )
        
        # Détecter les différents types d'anomalies
        unauthorized = vehicles_df.filter(
            col("is_stolen") | 
            col("is_cancelled") |
            (datediff(lit(date), col("registration_validity_date")) > 
             self.config.registration_expired_days)
        ).join(probable_visuals, col("plate_number") == col("lpr")) \
         .filter(col("distinct_cameras") >= self.config.min_cameras_for_validation)
        
        duplicate_plates = probable_visuals.join(vehicles_df, "plate_number") \
            .filter(
                ((col("make") != col("mmr_make")) & (col("make_probability") > 0.8)) |
                ((col("model").isNotNull()) & (col("mmr_model").isNotNull()) &
                 (col("model") != col("mmr_model")) & (col("model_probability") > 0.8))
            )
        
        long_absence = spotts_df.groupBy("lpr").agg(
            max("timestamp").alias("last_seen"),
            min("timestamp").alias("first_seen"),
            countDistinct("camera_id").alias("camera_count")
        ).filter(
            (datediff(lit(date), col("last_seen")) > self.config.long_absence_days) &
            (col("camera_count") >= self.config.min_cameras_for_validation)
        )
        
        unusual_paths = spotts_df.join(
            valid_sequences.filter(~col("is_valid_sequence")),
            ["prev_camera", "camera_id"]
        ).groupBy("lpr").agg(
            count("*").alias("invalid_sequence_count"),
            countDistinct("camera_id").alias("camera_count")
        ).filter(
            (col("invalid_sequence_count") > 2) &
            (col("camera_count") >= self.config.min_cameras_for_validation)
        )
        
        # Combiner toutes les anomalies
        all_anomalies = unauthorized.select(
            col("lpr").alias("plate_number"),
            lit("unauthorized").alias("anomaly_type"),
            col("make_probability"),
            col("model_probability"),
            col("distinct_cameras"),
            col("camera_list")
        ).union(
            duplicate_plates.select(
                "plate_number",
                lit("duplicate_plate").alias("anomaly_type"),
                "make_probability",
                "model_probability",
                "distinct_cameras",
                "camera_list"
            )
        ).union(
            long_absence.select(
                col("lpr").alias("plate_number"),
                lit("long_absence").alias("anomaly_type"),
                lit(None).alias("make_probability"),
                lit(None).alias("model_probability"),
                "camera_count",
                lit(None).alias("camera_list")
            )
        ).union(
            unusual_paths.select(
                col("lpr").alias("plate_number"),
                lit("unusual_path").alias("anomaly_type"),
                lit(None).alias("make_probability"),
                lit(None).alias("model_probability"),
                "camera_count",
                lit(None).alias("camera_list")
            )
        ).withColumn("detection_date", lit(date))
        
        return all_anomalies
    def save_anomalies(self, anomalies_df: DataFrame, date: str):
            """Sauvegarde les anomalies"""
            self.logger.info(f"Saving anomalies for date: {date}")
            
            anomalies_df.write \
                .format("delta") \
                .mode("append") \
                .partitionBy("detection_date") \
                .saveAsTable("vehicle_anomalies")


    def run_daily_analysis(self):
        """Exécute l'analyse quotidienne"""
        # Charger les données du jour
        today = datetime.now().date()
        spotts_df = self.spark.table("spotts").filter(col("date") == today)
        visint_df = self.spark.table("visint").filter(col("date") == today)
        vehicles_df = self.spark.table("vehicles")
        cameras_df = self.spark.table("cameras")
        
        # Détecter les anomalies
        unauthorized, duplicate_plates, long_absence, unusual_paths = \
            self.detect_anomalies(spotts_df, visint_df, vehicles_df, cameras_df)
        
        # Sauvegarder les résultats
        for anomaly_type, df in [
            ("unauthorized", unauthorized),
            ("duplicate_plates", duplicate_plates),
            ("long_absence", long_absence),
            ("unusual_paths", unusual_paths)
        ]:
            self.save_anomalies(
                df.withColumn("detection_date", lit(today))
                  .withColumn("anomaly_type", lit(anomaly_type)),
                "vehicle_anomalies"
            )


    def run_historical_analysis(self, start_date: str, end_date: str = None):
        """Exécute l'analyse sur une période historique"""
        self.logger.info(f"Starting historical analysis from {start_date}")
        
        if end_date is None:
            end_date = datetime.now().strftime("%Y-%m-%d")
            
        current_date = datetime.strptime(start_date, "%Y-%m-%d")
        end_date = datetime.strptime(end_date, "%Y-%m-%d")
        
        failed_dates = []
        processed_dates = []
        
        while current_date <= end_date:
            date_str = current_date.strftime("%Y-%m-%d")
            try:
                self.logger.info(f"Processing historical data for {date_str}")
                self.run_daily_analysis(date_str)
                processed_dates.append(date_str)
                self.logger.info(f"Successfully processed {date_str}")
                
            except Exception as e:
                self.logger.error(f"Error processing {date_str}: {str(e)}")
                failed_dates.append((date_str, str(e)))
                
            current_date += timedelta(days=1)
        
        # Résumé final
        self.logger.info("Historical analysis completed")
        self.logger.info(f"Successfully processed {len(processed_dates)} dates")
        if failed_dates:
            self.logger.error(f"Failed to process {len(failed_dates)} dates:")
            for date, error in failed_dates:
                self.logger.error(f"  {date}: {error}")
                
        return processed_dates, failed_dates

    def run_analysis(self, mode: str, start_date: str = None, end_date: str = None):
        """Point d'entrée principal pour l'analyse"""
        if mode == 'daily':
            return self.run_daily_analysis(start_date)
        elif mode == 'historical':
            return self.run_historical_analysis(start_date, end_date)
        else:
            raise ValueError(f"Mode inconnu: {mode}")

if __name__ == "__main__":
    import argparse
    from datetime import datetime, timedelta
    
    # Configuration du parser d'arguments
    parser = argparse.ArgumentParser(description='Détection d\'anomalies de véhicules')
    parser.add_argument(
        '--mode',
        choices=['daily', 'historical'],
        required=True,
        help='Mode d\'exécution: daily ou historical'
    )
    parser.add_argument(
        '--start-date',
        help='Date de début (YYYY-MM-DD). Pour le mode daily, c\'est la date à traiter.'
    )
    parser.add_argument(
        '--end-date',
        help='Date de fin pour le mode historical (YYYY-MM-DD)'
    )
    parser.add_argument(
        '--days-back',
        type=int,
        help='Nombre de jours à traiter en arrière (mode historical uniquement)'
    )
    
    args = parser.parse_args()
    
    # Configuration Spark
    spark = SparkSession.builder \
        .appName("Vehicle Anomaly Detection") \
        .config("spark.sql.extensions", "io.delta.sql.DeltaSparkSessionExtension") \
        .config("spark.sql.catalog.spark_catalog", "org.apache.spark.sql.delta.catalog.DeltaCatalog") \
        .config("spark.sql.adaptive.enabled", "true") \
        .getOrCreate()

    # Configuration du détecteur
    config = DetectionConfig(
        min_cameras_for_validation=2,
        min_camera_score=0.65,
        min_model_detection_score=0.55,
        daylight_hours=(6, 20)
    )

    # Création du détecteur
    detector = VehicleAnomalyDetector(spark, config)
    
    # Détermination des dates
    if args.mode == 'historical':
        if args.days_back:
            end_date = datetime.now()
            start_date = end_date - timedelta(days=args.days_back)
            start_date = start_date.strftime("%Y-%m-%d")
            end_date = end_date.strftime("%Y-%m-%d")
        else:
            start_date = args.start_date
            end_date = args.end_date
            
        if not start_date:
            raise ValueError("Pour le mode historical, précisez soit --days-back soit --start-date")
            
        detector.run_analysis('historical', start_date, end_date)
        
    else:  # mode daily
        date_to_process = args.start_date or datetime.now().strftime("%Y-%m-%d")
        detector.run_analysis('daily', date_to_process)

# Exemples d'utilisation:
# 1. Exécution quotidienne pour aujourd'hui:
#    python script.py --mode daily
#
# 2. Exécution quotidienne pour une date spécifique:
#    python script.py --mode daily --start-date 2024-02-01
#
# 3. Exécution historique avec période spécifique:
#    python script.py --mode historical --start-date 2024-01-01 --end-date 2024-02-01
#
# 4. Exécution historique sur les N derniers jours:
#    python script.py --mode historical --days-back 30'