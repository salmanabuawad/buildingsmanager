from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, status
from sqlalchemy.orm import Session
from typing import List
from app.database import get_db
from app.models import AssetFile, Asset, User
from app.schemas import AssetFileResponse
from app.auth import get_current_user
from app.config import settings
import uuid
from datetime import datetime

router = APIRouter()


def get_blob_service_client():
    from azure.storage.blob import BlobServiceClient
    return BlobServiceClient.from_connection_string(settings.AZURE_STORAGE_CONNECTION_STRING)


@router.post("/upload/{asset_id}", response_model=AssetFileResponse)
async def upload_file(
    asset_id: int,
    file: UploadFile = File(...),
    measurement_date: str = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if current_user.role not in ["admin", "editor"]:
        raise HTTPException(status_code=403, detail="Insufficient permissions")

    # Verify asset exists
    asset = db.query(Asset).filter(Asset.id == asset_id).first()
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found")

    # Generate unique file name
    file_extension = file.filename.split('.')[-1] if '.' in file.filename else ''
    unique_filename = f"{uuid.uuid4()}.{file_extension}"
    blob_path = f"assets/{asset_id}/{unique_filename}"

    try:
        # Upload to Azure Blob Storage
        blob_service_client = get_blob_service_client()
        blob_client = blob_service_client.get_blob_client(
            container=settings.AZURE_STORAGE_CONTAINER_NAME,
            blob=blob_path
        )

        file_content = await file.read()
        blob_client.upload_blob(file_content, overwrite=True)

        # Save file metadata to database
        db_file = AssetFile(
            asset_id=asset_id,
            file_name=file.filename,
            file_path=blob_path,
            file_type=file.content_type,
            file_size=len(file_content),
            measurement_date=datetime.fromisoformat(measurement_date) if measurement_date else None,
            uploaded_by=current_user.id
        )
        db.add(db_file)
        db.commit()
        db.refresh(db_file)

        return db_file

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"File upload failed: {str(e)}")


@router.get("/asset/{asset_id}", response_model=List[AssetFileResponse])
def get_asset_files(
    asset_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    files = db.query(AssetFile).filter(AssetFile.asset_id == asset_id).all()
    return files


@router.delete("/{file_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_file(
    file_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if current_user.role not in ["admin", "editor"]:
        raise HTTPException(status_code=403, detail="Insufficient permissions")

    db_file = db.query(AssetFile).filter(AssetFile.id == file_id).first()
    if not db_file:
        raise HTTPException(status_code=404, detail="File not found")

    try:
        # Delete from Azure Blob Storage
        blob_service_client = get_blob_service_client()
        blob_client = blob_service_client.get_blob_client(
            container=settings.AZURE_STORAGE_CONTAINER_NAME,
            blob=db_file.file_path
        )
        blob_client.delete_blob()

        # Delete from database
        db.delete(db_file)
        db.commit()
        return None

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"File deletion failed: {str(e)}")


@router.get("/download/{file_id}")
def get_file_url(
    file_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    db_file = db.query(AssetFile).filter(AssetFile.id == file_id).first()
    if not db_file:
        raise HTTPException(status_code=404, detail="File not found")

    try:
        blob_service_client = get_blob_service_client()
        blob_client = blob_service_client.get_blob_client(
            container=settings.AZURE_STORAGE_CONTAINER_NAME,
            blob=db_file.file_path
        )

        # Generate SAS token for temporary access (valid for 1 hour)
        from azure.storage.blob import generate_blob_sas, BlobSasPermissions
        from datetime import timedelta

        sas_token = generate_blob_sas(
            account_name=blob_service_client.account_name,
            container_name=settings.AZURE_STORAGE_CONTAINER_NAME,
            blob_name=db_file.file_path,
            account_key=blob_service_client.credential.account_key,
            permission=BlobSasPermissions(read=True),
            expiry=datetime.utcnow() + timedelta(hours=1)
        )

        url = f"{blob_client.url}?{sas_token}"
        return {"url": url, "filename": db_file.file_name}

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to generate download URL: {str(e)}")
