// STATUS: PLATIN — Writer multi-column persistence and geometry boundaries
use vgt_object_model::{WriterDocumentModel, WriterModelError};

fn column_model(columns: u8, gap: f64, widths: Option<Vec<f64>>) -> WriterDocumentModel {
    serde_json::from_value(serde_json::json!({
        "pageSetup": {
            "paperSize": "A4",
            "orientation": "portrait",
            "margins": "normal",
            "columns": columns,
            "columnGapMm": gap,
            "columnWidthsMm": widths
        }
    }))
    .expect("column payload must deserialize")
}

#[test]
fn unequal_columns_round_trip_losslessly() {
    let model = column_model(2, 8.0, Some(vec![50.0, 101.2]));
    model.validate().expect("valid column geometry must pass");

    let encoded = serde_json::to_vec(&model).expect("column model must serialize");
    let restored: WriterDocumentModel =
        serde_json::from_slice(&encoded).expect("column model must deserialize again");

    assert_eq!(restored, model);
}

#[test]
fn rejects_column_width_count_mismatch() {
    let model = column_model(2, 8.0, Some(vec![151.2]));
    assert!(matches!(
        model.validate(),
        Err(WriterModelError::InvalidColumnGeometry)
    ));
}

#[test]
fn rejects_overflowing_and_impossible_column_geometry() {
    let overflow = column_model(2, 8.0, Some(vec![80.0, 80.0]));
    let impossible = column_model(4, 50.0, None);

    assert!(matches!(
        overflow.validate(),
        Err(WriterModelError::InvalidColumnGeometry)
    ));
    assert!(matches!(
        impossible.validate(),
        Err(WriterModelError::InvalidColumnGeometry)
    ));
}
