# pp-pedia: Power Platform Documentation & RAG Assistant

**pp-pedia** is an intelligent, client-side documentation generator and retrieval-augmented generation (RAG) assistant for Microsoft Power Platform solutions.

All processing, parsing, documentation generation, vector embeddings, and database queries run **100% in your browser** without uploading your solution archives to any remote servers.

The data goes outside only incase you use AI to LLM providers servers.

---


## Why?
Manual documentation of Low Code solutions is tiring and time consuming. Also as the solution grows becomes difficult to manage. While one can go through the solution contents on platform itself, imagine documenting a huge flow by expanding every node. Phewww.

## What?
A Fully client side solution which extracts the solution , parses , generates docs , generates meta information, generates vector embeddings and stores it at client side.
(BYOAI Fully optional) An AI Assistant which leverages the generated documents  , meta information using client side tools to provide answers like:


## How?
Extract --> Parse --> Generate Docs --> Generate Meta Inforamtion --> Embed the Docs --> Preview 
(Optional )AI Agent --> Leverage client side Tools --> Agentic Loop --> Query Answer

<img width="1198" height="648" alt="image" src="https://github.com/user-attachments/assets/2e5ae7cf-ca99-402e-9da9-076a7d7af157" />

## 🌟 Key Features

1. **Client-Side Ingestion**:
2. **In-Browser data storage with PGLite**:
3. **In-Browser Vector Embeddings (Web Worker)**:
4. **Interactive Documentation Reader**:  
5. **Context-Aware RAG Assistant**:
6. **BYOK (Bring Your Own Key) & Offline Mode**:
7. **Exportable documentation**:
 

---



## 📄 License
Apache-2.0
