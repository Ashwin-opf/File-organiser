import csv
import os
import random

class MLClassifier:
    def __init__(self):
        self.dataset_path = os.path.join(os.path.dirname(__file__), 'datasets', 'example_data.csv')
        self.data = {}
        self.load_dataset()

    def load_dataset(self):
        """
        Loads the simple CSV dataset into memory.
        Format: filename,category
        """
        if not os.path.exists(self.dataset_path):
            print(f"Dataset not found at {self.dataset_path}")
            return

        try:
            with open(self.dataset_path, 'r', encoding='utf-8') as f:
                reader = csv.reader(f)
                next(reader, None) # Skip header
                for row in reader:
                    if len(row) >= 2:
                        filename = row[0].lower()
                        category = row[1]
                        self.data[filename] = category
            print(f"ML Classifier loaded {len(self.data)} examples.")
        except Exception as e:
            print(f"Error loading dataset: {e}")

    def predict(self, filename):
        """
        Predicts category based on simple keyword matching from dataset.
        In a real ML model, this would use TF-IDF/Embeddings + Classifier.
        For MVP, we use 'contains' logic from the examples.
        """
        filename = filename.lower()
        
        # 1. Exact Match
        if filename in self.data:
            return self.data[filename]
            
        # 2. Keyword/Substring Match
        # Check if any known filename in dataset is part of the input filename
        # e.g. "invoice" in "my_invoice_2024.pdf"
        for example_name, category in self.data.items():
            # Extract distinct keywords from example (e.g. "invoice" from "invoice_2024.pdf")
            keywords = example_name.replace('.', ' ').replace('_', ' ').split()
            
            # If significant keywords match
            match_count = 0
            for kw in keywords:
                if len(kw) > 3 and kw in filename:
                    match_count += 1
            
            if match_count > 0:
                print(f"ML Match found: '{filename}' matched example '{example_name}' -> {category}")
                return category
                
        return None
