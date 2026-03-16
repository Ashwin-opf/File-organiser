
import pandas as pd
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import SGDClassifier
from sklearn.pipeline import Pipeline
from sklearn.model_selection import train_test_split
from skl2onnx import convert_sklearn
from skl2onnx.common.data_types import StringTensorType
import os

# 1. Load Data
dataset_path = 'datasets/example_data.csv'
if not os.path.exists(dataset_path):
    print("Dataset not found!")
    exit(1)

df = pd.read_csv(dataset_path)
X = df['filename'].fillna('')
y = df['category'].fillna('Others')

# 2. Key: Train Model (Pipeline: TF-IDF -> Classifier)
# We use a Pipeline so the ONNX model takes raw strings as input!
pipeline = Pipeline([
    ('tfidf', TfidfVectorizer(min_df=1, max_df=0.9, ngram_range=(1, 2))),
    ('clf', SGDClassifier(loss='hinge', penalty='l2', alpha=1e-3, random_state=42, max_iter=5, tol=None))
])

print("Training model...")
pipeline.fit(X, y)
print("Model trained.")

# 3. Test Model
# test_files = ["invoice_2024.pdf", "project_plan.docx", "setup.exe", "family_photo.jpg"]
# pred = pipeline.predict(test_files)
# for f, p in zip(test_files, pred):
#     print(f"{f} -> {p}")

# 4. Export to ONNX
print("Exporting to ONNX...")
initial_type = [('input_filenames', StringTensorType([None, 1]))] 
# Note: StringTensorType dims - [None, 1] means batch size N, 1 column

onnx_model = convert_sklearn(pipeline, initial_types=initial_type)

with open("file_organizer.onnx", "wb") as f:
    f.write(onnx_model.SerializeToString())

print("Saved 'file_organizer.onnx'")

# 5. Verify ONNX Model (Sanity Check)
try:
    import onnxruntime as rt
    import numpy as np
    
    sess = rt.InferenceSession("file_organizer.onnx")
    input_name = sess.get_inputs()[0].name
    label_name = sess.get_outputs()[0].name

    test_input = np.array([["invoice.pdf"], ["vacation.jpg"]]).astype(str) # Shape (2, 1)
    res = sess.run([label_name], {input_name: test_input})
    print("ONNX Verification:", res[0])
except ImportError:
    print("onnxruntime not installed. Skipping Python verification.")
except Exception as e:
    print(f"Verification failed: {e}")
