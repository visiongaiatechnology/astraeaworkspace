use std::{
    mem::{size_of, MaybeUninit},
    ptr,
};
use vgt_crypto::{DocumentKeyHierarchy, KEY_SIZE, SALT_SIZE};

#[allow(unsafe_code)]
fn zeroize_document_key_before_deallocation() -> bool {
    let document_id = [0xa5u8; 16];
    let dek = [0xa5u8; KEY_SIZE];
    let salt = [0xa5u8; SALT_SIZE];
    let mut slot = Box::<MaybeUninit<DocumentKeyHierarchy>>::new_uninit();
    let raw = slot.as_mut_ptr() as *mut DocumentKeyHierarchy;

    // SAFETY: `raw` points to the correctly aligned live allocation owned by `slot`.
    // The write initializes exactly one value, `drop_in_place` ends that value exactly
    // once while the allocation remains owned, and the type consists only of initialized
    // byte arrays with no padding. After Drop, the still-live allocation is read only as
    // bytes to verify ZeroizeOnDrop; no reference to the ended value is used.
    unsafe {
        raw.write(DocumentKeyHierarchy::from_existing_dek(
            document_id,
            dek,
            salt,
        ));
        ptr::drop_in_place(raw);
        let bytes = std::slice::from_raw_parts(raw.cast::<u8>(), size_of::<DocumentKeyHierarchy>());
        bytes.iter().all(|b| *b == 0)
    }
}

#[test]
fn sec007_document_key_hierarchy_is_zero_before_heap_deallocation() {
    assert!(
        zeroize_document_key_before_deallocation(),
        "ZeroizeOnDrop left non-zero bytes in live allocation"
    );
}
