from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import os
from dotenv import load_dotenv
import strawberry
from strawberry.fastapi import GraphQLRouter
from resolvers import Query, Mutation

load_dotenv()

app = FastAPI(title="Buildings Manager API")

FRONTEND_URL = os.getenv('FRONTEND_URL', 'http://localhost:5173')

app.add_middleware(
    CORSMiddleware,
    allow_origins=[FRONTEND_URL, "http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

schema = strawberry.Schema(query=Query, mutation=Mutation)

graphql_app = GraphQLRouter(schema)

app.include_router(graphql_app, prefix="/graphql")

@app.get("/")
def read_root():
    return {"message": "Buildings Manager API with GraphQL", "status": "running", "graphql_endpoint": "/graphql"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
