# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**jc-mcp** is a Jira and Confluence MCP (Model Context Protocol) server focused on optimizing token efficiency for everyday tasks. Unlike general-purpose Atlassian MCP servers, this server is designed to return concise, structured responses that minimize token consumption while preserving the information LLM agents actually need.

## Development Commands

*To be updated as the project is scaffolded.*

## Architecture

*To be updated during implementation.*

## Key Design Principles

- **Token efficiency is the primary design goal.** Every tool response should return only the fields an LLM needs to reason and act — strip verbose HTML, redundant metadata, and deeply nested structures by default.
- **Update this file.** When adding new tools, changing the build system, or altering project structure, update the relevant sections of CLAUDE.md so future sessions stay current.
